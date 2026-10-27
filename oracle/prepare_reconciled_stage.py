#!/usr/bin/env python3
"""Build a PRIVATE, non-destructive Oracle staging snapshot from:
- historical backup (evidence only)
- current authenticated Firebase export (canonical for shared sections)
- same-browser local archive (canonical for sections absent from Firebase)

Any historical-only rows or disagreements are copied to migrationReview, NOT
reintroduced into operational sections. All originals remain unchanged.
Never output record content or identifiers, and never commit the output.
"""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

MAX_FILE = 150_000_000
SECTION = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
TODAY = re.compile(r"^20[0-9]{2}-[0-9]{2}-[0-9]{2}$")

def read_json(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_FILE:
        raise ValueError("File sorgente inesistente, symlink o dimensione non ammessa")
    obj = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(obj,dict) or obj.get("app") != "Varga Gestionale":
        raise ValueError("Applicazione sorgente non riconosciuta")
    if not isinstance(obj.get("data"),dict) or not obj["data"]:
        raise ValueError("Backup privo delle sezioni data")
    return obj

def date_of(obj):
    s = str(obj.get("exported_at") or obj.get("createdAt") or "")[:10]
    if not TODAY.fullmatch(s):
        raise ValueError("Data esportazione assente o non valida")
    date.fromisoformat(s)
    return s

def id_for(section,record):
    if isinstance(record,dict):
        key = "sourcePath" if section == "vcRecords" else "id"
        val = record.get(key)
        return (key,str(val)) if val is not None and str(val) else None
    if record is None or isinstance(record,(bool,int,float,str)):
        return ("value",json.dumps(record,ensure_ascii=False,allow_nan=False))
    return None

def index(section,value):
    if not isinstance(value,list):
        return None
    mapping={}
    for item in value:
        key=id_for(section,item)
        if key is None or key in mapping:
            return None
        mapping[key]=item
    return mapping

def validate_sect(data, allow_historical_review=False):
    if not all(isinstance(k,str) and SECTION.fullmatch(k) for k in data):
        raise ValueError("Nome sezione non sicuro")
    if "migrationReview" in data and not allow_historical_review:
        raise ValueError("Sezione migrationReview già presente nella fonte attuale")

def build(old,live):
    if live.get("workspace") != "varga-azienda":
        raise ValueError("Workspace del nuovo export non corrisponde a varga-azienda")
    if date_of(live)<date_of(old) or date_of(live)>date.today().isoformat():
        raise ValueError("Export attuale più vecchio dello storico o nel futuro")
    if live.get("source_mode") not in ("incremental-v3","legacy"):
        raise ValueError("Modalità dell'export attuale non verificata")
    hist=old["data"]
    cloud=live["data"]
    local=live.get("local_browser_archive")
    if not isinstance(local,dict) or not local:
        raise ValueError("Archivio locale assente: procedura interrotta")
    validate_sect(hist,allow_historical_review=True);validate_sect(cloud);validate_sect(local)
    current={}
    # Canonical current Firestore for every section present in cloud.
    # Only-local sections come from the exporting browser.
    for section in sorted(set(cloud)|set(local)):
        current[section]=cloud[section] if section in cloud else local[section]
    review={"historicalOnly":{},"cloudBrowserConflict":{},"historicalSectionAbsent":{}}
    conflicts=Counter()
    absent=Counter()
    # Preserve browser data in review if cloud/browser disagree for any section.
    for section in sorted(set(cloud)&set(local)):
        if cloud[section]!=local[section]:
            review["cloudBrowserConflict"][section]={"browserCopy":local[section]}
            conflicts[section]+=1
    # Preserve entire historic section when neither current source has it.
    for section in sorted(set(hist)-set(current)-{"migrationReview"}):
        review["historicalSectionAbsent"][section]=hist[section]
        absent[section]+=1
    # When historic individual rows vanish from active data, quarantine those
    # rows rather than silently resurrecting possibly intentional deletions.
    for section in sorted((set(hist)&set(current))-{"migrationReview"}):
        if not isinstance(hist[section],list) or not isinstance(current[section],list):
            if section not in cloud and section in local and hist[section]!=current[section]:
                # Old object preserved in historical backup; never auto-replace.
                pass
            continue
        prior=index(section,hist[section])
        now=index(section,current[section])
        if prior is None or now is None:
            if hist[section]!=current[section]:
                review["historicalOnly"][section]={"unmatchedHistorical":hist[section],
                    "reason":"missing_or_duplicate_identifiers"}
                absent[section]+=len(hist[section])
        else:
            rows=[prior[k] for k in prior if k not in now]
            if rows:
                review["historicalOnly"][section]={"records":rows,"count":len(rows)}
                absent[section]+=len(rows)
    # Explicit review section is not interpreted by the current frontend.
    # Staging only; never treat migrationReview as production signoff.
    if "migrationReview" in hist:
        review["previousReview"]=hist["migrationReview"]
    review["sourceDates"]={"historical":date_of(old),"current":date_of(live)}
    review["notes"]="Separate historical evidence and current cloud/browser conflicts. Do not automatically restore or remove."
    current["migrationReview"]=review
    return current,conflicts,absent

def add_earliest_historical(sections, earliest):
    """Preserve rows only found in the oldest backup, without operational writes."""
    review=sections["migrationReview"]
    extra=Counter()
    for sec,old_rows in earliest["data"].items():
        if sec=="migrationReview":
            raise ValueError("Sezione riservata presente nel backup più vecchio")
        cur=sections.get(sec)
        if cur is None:
            if sec not in review["historicalSectionAbsent"]:
                review["historicalSectionAbsent"][sec]=old_rows
                extra[sec]=len(old_rows) if isinstance(old_rows,list) else 1
            continue
        old_idx=index(sec,old_rows)
        cur_idx=index(sec,cur)
        if old_idx is None or cur_idx is None:
            if old_rows!=cur and sec not in review["historicalOnly"]:
                review["historicalOnly"][sec]={
                    "unmatchedHistorical":old_rows,
                    "reason":"earliest_missing_or_duplicate_identifiers"}
                extra[sec]=len(old_rows) if isinstance(old_rows,list) else 1
            continue
        item=review["historicalOnly"].get(sec)
        if item is not None and "unmatchedHistorical" in item:
            continue
        quarantined=(item or {}).get("records",[])
        known_ids=set()
        for rec in quarantined:
            ident=id_for(sec,rec)
            if ident is not None:known_ids.add(ident)
        extra_rows=[v for k,v in old_idx.items() if k not in cur_idx and k not in known_ids]
        if extra_rows:
            all_rows=quarantined+extra_rows
            review["historicalOnly"][sec]={"records":all_rows,"count":len(all_rows)}
            extra[sec]+=len(extra_rows)
    review["sourceDates"]["earliest"]=date_of(earliest)
    return extra

def save_private(path,payload):
    parent=path.parent.resolve(strict=True)
    if path.is_symlink() or path.exists():
        raise ValueError("Output già esistente: non sovrascrivo")
    if parent != Path("/home/ubuntu/gestionale-private"):
        raise ValueError("Output consentito solo in /home/ubuntu/gestionale-private")
    os.umask(0o077)
    body=json.dumps(payload,ensure_ascii=False,allow_nan=False,separators=(",",":")).encode("utf-8")
    if len(body)>40_000_000:
        raise ValueError("Snapshot elaborato oltre il limite di importazione 40MB")
    fd,tmp=tempfile.mkstemp(dir=str(parent),prefix=".vg-reconciled-",suffix=".tmp")
    try:
        with os.fdopen(fd,"wb") as f:
            os.fchmod(f.fileno(),0o600)
            f.write(body);f.flush();os.fsync(f.fileno())
        os.link(tmp,path)
    finally:
        os.unlink(tmp)
    return len(body),hashlib.sha256(body).hexdigest()

def main():
    p=argparse.ArgumentParser(description="Prepara archivio Oracle privato: cloud + browser + quarantena storico")
    p.add_argument("historical",type=Path)
    p.add_argument("current_export",type=Path)
    p.add_argument("output",type=Path)
    p.add_argument("--earliest",type=Path,required=True,help="Il backup ulteriore del 15 ottobre")
    mode=p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run",action="store_true",help="Verifica senza creare output")
    mode.add_argument("--verify-existing",action="store_true",help="Verifica che il file esistente sia identico alla ricostruzione da tutte le fonti")
    a=p.parse_args()
    try:
        old=read_json(a.historical);live=read_json(a.current_export)
        sections,conflicts,absent=build(old,live)
        earliest=read_json(a.earliest)
        if date_of(earliest)>date_of(old):
            raise ValueError("Il backup earliest non precede il backup intermedio")
        earliest_extra=add_earliest_historical(sections,earliest)
        print("=== RICONCILIAZIONE ORACLE: NO SOVRASCRITTURE ===")
        print("Cloud+browser sezioni operative:",len(sections)-1)
        print("Sezioni riservate alla revisione:",len(sections["migrationReview"]["historicalOnly"]))
        print("Conflitti cloud/browser:",sum(conflicts.values()))
        print("Sezioni storiche assenti da entrambe le fonti:",len(sections["migrationReview"]["historicalSectionAbsent"]))
        print("Record aggiuntivi preservati dal primo backup:",sum(earliest_extra.values()))
        for k in sorted(earliest_extra):print(" ",k,earliest_extra[k])
        print("Record storici solo in quarantena, per sezione:")
        for k in sorted(absent):print(" ",k,absent[k])
        if conflicts:
            print("SEZIONI IN CONFLITTO (non scegliere automaticamente):",", ".join(sorted(conflicts)))
            print("Browser conflicts preserved only in migrationReview")
        if a.dry_run:
            print("DRY RUN: nessun file creato, nessun database modificato")
            return 0
        # Do not emit the workspace selector: the already-deployed importer
        # must be able to place this PRIVATE snapshot into a dated staging ID.
        # The authenticated source workspace was strictly verified above.
        wrapper={"app":"Varga Gestionale","sourceWorkspace":live["workspace"],
          "createdAt":live.get("exported_at") or live.get("createdAt"),
          "purpose":"private Oracle staging / reconciled cloud and browser",
          "data":sections}
        if a.verify_existing:
            if not a.output.is_file() or a.output.is_symlink() or a.output.stat().st_size > MAX_FILE:
                raise ValueError("Snapshot esistente non valido")
            # Compare SHA256 of the exact deterministic output (including review)
            # against the file already present. Never overwrite either source.
            expected=json.dumps(wrapper,ensure_ascii=False,allow_nan=False,separators=(",",":")).encode("utf-8")
            actual=a.output.read_bytes()
            if actual!=expected:
                raise ValueError("Snapshot esistente DIVERSO dalle sorgenti: verifica manuale richiesta")
            print("ARCHIVIO ESISTENTE VALIDATO: identico alla riconciliazione delle 3 fonti")
            print("Bytes:",len(actual),"SHA256:",hashlib.sha256(actual).hexdigest())
            return 0
        length,digest=save_private(a.output,wrapper)
        print("ARCHIVIO DI STAGING CREATO NELLA CARTELLA PRIVATA")
        print("Bytes:",length,"SHA256:",digest)
        print("NON importare in produzione senza ulteriore verifica funzionale")
        return 0
    except (OSError,ValueError,TypeError,UnicodeError) as exc:
        # Do not print exception values: they may contain private paths/data.
        print("ERRORE: riconciliazione interrotta ("+type(exc).__name__+"). Nessuna modifica al database.",file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
