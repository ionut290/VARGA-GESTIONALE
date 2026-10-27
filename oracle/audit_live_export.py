#!/usr/bin/env python3
"""Read-only audit of the CURRENT authenticated browser export against historical
Varga Gestionale backup. Does not display record bodies, keys, or personal data.
Does not connect to any network or write to PostgreSQL.
"""
import argparse
import json
from pathlib import Path
from collections import Counter
from datetime import date
import re
import sys

def read(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size>150_000_000:
        raise ValueError("File assente/non valido/oltre 150 MB")
    obj=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(obj,dict) or obj.get("app")!="Varga Gestionale":
        raise ValueError("Applicazione sorgente inattesa")
    if not isinstance(obj.get("data"),dict):
        raise ValueError("Sezioni cloud data assenti")
    return obj

def ids(section,values):
    out=[]
    if not isinstance(values,list):return None
    for row in values:
        if not isinstance(row,dict):return None
        col="sourcePath" if section=="vcRecords" else "id"
        value=row.get(col)
        if not value:return None
        out.append(str(value))
    if any(c>1 for c in Counter(out).values()):return None
    return set(out)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("historical",type=Path)
    parser.add_argument("export",type=Path)
    a=parser.parse_args()
    try:
        old=read(a.historical);live=read(a.export)
        stamp=str(live.get("exported_at") or live.get("createdAt") or "")[:10]
        if not re.fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}",stamp):
            raise ValueError("Il nuovo export non dichiara una data valida")
        if stamp<str(old.get("createdAt") or "")[:10]:
            raise ValueError("Il nuovo export e' piu vecchio dello storico")
        if stamp>date.today().isoformat():
            raise ValueError("Data futura: controllare orologio del computer")
        if live.get("workspace") not in ("varga-azienda",None):
            raise ValueError("Workspace diverso da varga-azienda")
        cloud=live["data"]
        local=live.get("local_browser_archive") or {}
        if not isinstance(local,dict):raise ValueError("Archivio browser locale non valido")
        print("=== AUDIT BACKUP LIVE / SOLO LETTURA ===")
        print("Archivio storico:",old.get("createdAt","sconosciuto")[:10])
        print("Esportazione corrente:",stamp,"modo:",live.get("source_mode","non dichiarato"))
        print("Sezioni cloud:",len(cloud),"sezioni locali:",len(local))
        print("Sezione | storico | cloud attuale | ID aggiunti | ID assenti dallo snapshot cloud")
        unavailable=[]
        for section in sorted(old["data"]):
            old_data=old["data"][section]
            if section not in cloud:
                unavailable.append(section);continue
            now_data=cloud[section]
            if not isinstance(old_data,list) or not isinstance(now_data,list):
                print(section," | struttura non-lista / confronto valori omesso")
                continue
            before=ids(section,old_data);after=ids(section,now_data)
            if before is None or after is None:
                print(section,"|",len(old_data),"|",len(now_data),"| ID non verificabili")
                continue
            print(section,"|",len(old_data),"|",len(now_data),"|",len(after-before),"|",len(before-after))
        print("Sezioni storiche NON presenti nell'export cloud:",len(unavailable))
        if unavailable:print("Nomi sezioni NON disponibili:",", ".join(unavailable))
        print("NOTA: sezioni mancanti dal solo export Firestore NON indicano perdita dati.")
        print("NOTA: archivio browser locale NON e' automaticamente importato dall'API Oracle.")
        print("NOTA: dati locali e cloud devono essere riconciliati PRIMA del cutover.")
        return 0
    except (OSError,ValueError,TypeError,UnicodeError,json.JSONDecodeError) as e:
        print("AUDIT INTERROTTO: file mancante, vecchio, di altro workspace o non valido.",file=sys.stderr)
        return 2

if __name__=="__main__":
    sys.exit(main())
