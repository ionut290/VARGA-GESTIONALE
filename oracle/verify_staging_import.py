#!/usr/bin/env python3
"""Verify exact section-level JSON content of one dated Oracle staging workspace.

Read-only: selects a single staging workspace, compares all sections with an
already prepared private snapshot; never prints customer data or record IDs.
Exit 0: existing workspace matches file exactly.
Exit 3: staging workspace absent/empty, safe to invoke protected importer.
Exit 2: inconsistent data, tooling failure, or unexpected input; do not import.
"""
import argparse
from datetime import date
import json
from pathlib import Path
import re
import subprocess
import sys

def verify(path, query_fn):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 150_000_000:
        raise ValueError("Snapshot mancante / file non regolare")
    src=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(src,dict) or src.get("app")!="Varga Gestionale" or not isinstance(src.get("data"),dict):
        raise ValueError("Formato snapshot non valido")
    if src.get("sourceWorkspace")!="varga-azienda" or src.get("workspace") is not None:
        raise ValueError("Non è uno snapshot riconciliato per staging")
    if src.get("purpose")!="private Oracle staging / reconciled cloud and browser":
        raise ValueError("Provenienza snapshot non verificata")
    stamp=str(src.get("createdAt",""))[:10]
    if not re.fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}",stamp):
        raise ValueError("Data snapshot non valida")
    date.fromisoformat(stamp)
    workspace="gestionale_backup_"+stamp.replace("-","")
    if workspace!="gestionale_backup_20261027":
        raise ValueError("Workspace inatteso: non è il test previsto per il 27 ottobre")
    expected=src["data"]
    if "migrationReview" not in expected or len(expected)<25:
        raise ValueError("Sezioni per staging/revisione assenti")
    result=query_fn(workspace)
    if result is None:
        raise ValueError("Database non raggiungibile o errore query")
    if not result:
        print("WORKSPACE VUOTO: ",workspace)
        return 3
    if result.keys()!=expected.keys():
        print("STOP: insieme sezioni già importate DIFFERENTE (nessuna modifica).")
        return 2
    different=[key for key in expected if expected[key]!=result[key]]
    if different:
        print("STOP: contenuto già importato non corrisponde (numero sezioni diverse:",len(different),").")
        return 2
    print("WORKSPACE STAGING GIÀ IMPORTATO E VERIFICATO:",workspace,
          "Sezioni:",len(result),"Identità JSON: OK")
    return 0

def query_db(workspace):
    sql=(
        "SELECT jsonb_build_object('section',section,'data',data)::text "
        "FROM vg.workspace_sections WHERE workspace_id='"+workspace+"' ORDER BY section"
    )
    cmd=[
        "docker","compose","-p","vg-gestionale-oracle","exec","-T","db",
        "psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1",
        "-U","varga_gestionale","-d","varga_gestionale","-c",sql
    ]
    finished=subprocess.run(cmd,capture_output=True,text=True,timeout=90,check=False)
    if finished.returncode!=0:
        return None
    found={}
    for line in finished.stdout.splitlines():
        if not line.strip():
            continue
        obj=json.loads(line)
        section=obj.get("section")
        if not isinstance(section,str) or section in found:
            raise ValueError("Risposta PostgreSQL non valida")
        found[section]=obj["data"]
    return found

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("snapshot",type=Path)
    args=parser.parse_args()
    try:
        return verify(args.snapshot,query_db)
    except (OSError,ValueError,TypeError,UnicodeError,subprocess.TimeoutExpired):
        print("CONTROLLO DB FALLITO: operazione interrotta, dati invariati.",file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
