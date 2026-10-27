#!/usr/bin/env python3
"""Read-only three-way comparison: historical backup, current Firebase, local browser.
Prints aggregate counts and section names, never record identifiers or values.
Does not connect to external services or modify files/databases.
"""
import argparse
from collections import Counter
from datetime import date
import json
from pathlib import Path
import re
import sys

def load(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 150_000_000:
        raise ValueError("archivio assente o troppo grande")
    obj=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(obj,dict) or obj.get("app")!="Varga Gestionale" or not isinstance(obj.get("data"),dict):
        raise ValueError("formato backup Varga Gestionale non valido")
    return obj

def identity(section,item):
    if isinstance(item,dict):
        field="sourcePath" if section=="vcRecords" else "id"
        val=item.get(field)
        return (field,str(val)) if val is not None and str(val) else None
    if item is None or isinstance(item,(bool,int,float,str)):
        return ("value",json.dumps(item,ensure_ascii=False,sort_keys=True))
    return None

def indexed(section,rows):
    if not isinstance(rows,list):
        return None
    result={}
    for item in rows:
        ident=identity(section,item)
        if ident is None or ident in result:
            return None
        result[ident]=item
    return result

def changes(section,older,newer):
    old=indexed(section,older)
    new=indexed(section,newer)
    if old is None or new is None:
        return None
    added=len(new.keys()-old.keys())
    missing=len(old.keys()-new.keys())
    other=sync=0
    for ident in old.keys() & new.keys():
        a,b=old[ident],new[ident]
        if a==b:
            continue
        if isinstance(a,dict) and isinstance(b,dict) and (
          {k:v for k,v in a.items() if k!="syncedAt"} ==
          {k:v for k,v in b.items() if k!="syncedAt"}
        ):
            sync+=1
        else:
            other+=1
    return (added,missing,other,sync)

def count(value):
    if value is None:return "-"
    if isinstance(value,list):return str(len(value))
    if isinstance(value,dict):return "oggetto"
    return "altro"

def fmt(result):
    if result is None:return "ID/tipo non confrontabile"
    a,b,c,d=result
    return "+%d -%d altri=%d solo-sync=%d" % (a,b,c,d)

def main():
    ap=argparse.ArgumentParser(description="Audit storico, Firebase e browser privato; sola lettura")
    ap.add_argument("historical",type=Path)
    ap.add_argument("current_export",type=Path)
    args=ap.parse_args()
    try:
        old=load(args.historical)
        live=load(args.current_export)
        stamp=str(live.get("exported_at") or live.get("createdAt") or "")[:10]
        historic_stamp=str(old.get("createdAt") or old.get("exported_at") or "")[:10]
        if not re.fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}",stamp):
            raise ValueError("data nuova esportazione non valida")
        if stamp>date.today().isoformat() or (historic_stamp and stamp<historic_stamp):
            raise ValueError("data esportazione fuori intervallo atteso")
        if live.get("workspace") not in (None,"varga-azienda"):
            raise ValueError("workspace differente")
        before=old["data"];cloud=live["data"]
        browser=live.get("local_browser_archive")
        if not isinstance(browser,dict):
            raise ValueError("archivio locale browser non presente")
        print("=== CONFRONTO A TRE / NESSUN DATO RISERVATO ===")
        print("Storico:",historic_stamp,"Export:",stamp,
              "Sezioni storico/cloud/browser:",len(before),len(cloud),len(browser))
        print("SEZIONE | STORICO | FIREBASE | BROWSER | CLOUD->BROWSER | STORICO->BROWSER")
        absent_everywhere=[]
        historical_gaps=[]
        browser_cloud_differences=[]
        for sec in sorted(set(before)|set(cloud)|set(browser)):
            a=before.get(sec);b=cloud.get(sec);c=browser.get(sec)
            bc=changes(sec,b,c) if isinstance(b,list) and isinstance(c,list) else None
            ac=changes(sec,a,c) if isinstance(a,list) and isinstance(c,list) else None
            print(sec,"|",count(a),"|",count(b),"|",count(c),"|",
                  fmt(bc) if bc is not None else "-" if b is None or c is None else "strutture non confrontabili",
                  "|",fmt(ac) if ac is not None else "-" if a is None or c is None else "strutture non confrontabili")
            if sec in before and sec not in cloud:
                if sec not in browser:
                    absent_everywhere.append(sec)
                elif isinstance(a,list) and (ac is None or ac[1]>0):
                    historical_gaps.append(sec)
            if isinstance(b,list) and isinstance(c,list) and (
                bc is None or bc[0] or bc[1] or bc[2]
            ):
                browser_cloud_differences.append(sec)
        print("=== AVVISI DI RICONCILIAZIONE ===")
        print("Sezioni storiche assenti sia da cloud sia da browser:",len(absent_everywhere))
        if absent_everywhere:print("Sezioni:",", ".join(absent_everywhere))
        print("Sezioni NON cloud con record storici assenti/ID non confrontabili nel browser:",len(historical_gaps))
        if historical_gaps:print("Sezioni:",", ".join(historical_gaps))
        print("Sezioni cloud e browser con differenze non limitate al solo syncedAt:",len(browser_cloud_differences))
        if browser_cloud_differences:print("Sezioni:",", ".join(browser_cloud_differences))
        print("Non equivale a autorizzazione a unire o sostituire dati: nessuna modifica eseguita.")
        return 0
    except (OSError,ValueError,TypeError,UnicodeError):
        print("CONTROLLO FALLITO: dati non letti o incoerenti (nessun dato mostrato).",file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
