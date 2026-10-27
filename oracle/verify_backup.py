#!/usr/bin/env python3
"""Read-only integrity checks for an authorized Varga Gestionale JSON backup.
Never prints company names, personal data, customer records or credentials.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description="Verifica privata archivio Varga Gestionale")
    p.add_argument("file",type=Path,help="File JSON locale, NON inserirlo nel repository")
    p.add_argument("--min-date",default="",help="Data minima YYYY-MM-DD richiesta per import definitivo")
    a=p.parse_args()
    if not a.file.is_file(): p.error("File non trovato")
    raw=a.file.read_bytes()
    if len(raw)>150_000_000:p.error("File troppo grande per questo verificatore")
    try: obj=json.loads(raw)
    except Exception:p.error("JSON non valido")
    data=obj.get("data") if isinstance(obj,dict) else None
    if not isinstance(data,dict) or not data:p.error("Manca un oggetto data non vuoto")
    if obj.get("app")!="Varga Gestionale":p.error("Applicazione sorgente non riconosciuta")
    date=str(obj.get("createdAt") or obj.get("exported_at") or "")[:10]
    if a.min_date and date<a.min_date:p.error("Backup non abbastanza recente per import definitivo")
    print("Archivio:", obj["app"])
    print("Data backup:",date or "non dichiarata")
    print("Dimensione byte:",len(raw))
    print("SHA256:",hashlib.sha256(raw).hexdigest())
    print("Sezioni:",len(data))
    for key in sorted(data):
        v=data[key]
        if isinstance(v,list):print("  "+key+": "+str(len(v)))
    lists=data.get("priceLists",[])
    entries=data.get("entries",[])
    if not isinstance(lists,list) or not isinstance(entries,list):p.error("Formato prezziari non valido")
    listids={x.get("id") for x in lists if isinstance(x,dict)}
    broken=sum(1 for row in entries if not isinstance(row,dict) or row.get("priceListId") not in listids)
    if broken:p.error(str(broken)+" voci senza listino")
    for key in ("priceLists","entries","clients","quotes","jobs"):
        v=data.get(key,[])
        if isinstance(v,list):
            ids=[str(x.get("id")) for x in v if isinstance(x,dict) and x.get("id")]
            duplicated=sum(n-1 for n in Counter(ids).values() if n>1)
            if duplicated:p.error("ID duplicati nella sezione "+key+": "+str(duplicated))
    print("Integrità essenziale: OK")
    print("I dati Cantieri possono ripetere ID locali: distinguere tramite sourcePath.")
    print("Non equivale a validazione di attualità Firebase o import su Oracle.")
if __name__=="__main__": main()
