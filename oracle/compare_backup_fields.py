#!/usr/bin/env python3
"""Read-only backup field comparison: aggregate counts, never values or IDs."""
from collections import Counter
import json
from pathlib import Path
import re
import sys

def load(path):
    p=Path(path)
    if not p.is_file() or p.is_symlink() or p.stat().st_size>150_000_000:
        raise ValueError("File mancante/non valido")
    obj=json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(obj,dict) or obj.get("app")!="Varga Gestionale" or not isinstance(obj.get("data"),dict):
        raise ValueError("Formato backup non valido")
    return obj["data"]

def identity(sec,row):
    if isinstance(row,dict):
        key="sourcePath" if sec=="vcRecords" else "id"
        v=row.get(key)
        return (key,str(v)) if v is not None and str(v) else None
    if row is None or isinstance(row,(str,int,float,bool)):
        return ("value",json.dumps(row,sort_keys=True,ensure_ascii=False))
    return None

def paths(a,b,p="",depth=0):
    if a==b:return set()
    if depth>=9:return {p or "(contenuto)"}
    if isinstance(a,dict) and isinstance(b,dict):
        out=set()
        for k in a.keys()|b.keys():
            key=(p+"." if p else "")+str(k)
            out.update({key} if k not in a or k not in b else paths(a[k],b[k],key,depth+1))
        return out
    if isinstance(a,list) and isinstance(b,list):
        if len(a)!=len(b):return {p or "(lista)"}
        out=set()
        for x,y in zip(a,b):
            if x!=y:out.update(paths(x,y,p+"[]",depth+1))
            if len(out)>500:break
        return out
    return {p or "(contenuto)"}

def safe(s):
    return s if len(s)<=75 and re.fullmatch(r"[A-Za-z][A-Za-z0-9_.\[\]]*",s) else "(campo riservato)"

def report(sec,a,b):
    if not isinstance(a,list) or not isinstance(b,list):
        if a!=b:print(sec+": oggetto modificato (contenuto non mostrato)")
        return
    ai=[identity(sec,x) for x in a];bi=[identity(sec,x) for x in b]
    if None in ai or None in bi or max(Counter(ai).values(),default=0)>1 or max(Counter(bi).values(),default=0)>1:
        print(sec+": identificativi mancanti o duplicati; confronto non affidabile")
        return
    old=dict(zip(ai,a));new=dict(zip(bi,b))
    sync=other=0
    fields=Counter()
    for key in old.keys()&new.keys():
        x,y=old[key],new[key]
        if x==y:continue
        d=paths(x,y)
        if d and d<={"syncedAt"}:sync+=1
        else:
            other+=1
            for field in d-{"syncedAt"}:fields[safe(field)]+=1
    added=len(new.keys()-old.keys());missing=len(old.keys()-new.keys())
    if sync or other or added or missing:
        print(sec,json.dumps({"nuovi":added,"assenti":missing,"solo_syncedAt":sync,
              "altri_modificati":other,"campi_modificati_piu_frequenti":fields.most_common(6)},
              ensure_ascii=False,separators=(",",":")))

def main():
    if len(sys.argv)!=3:
        print("Uso: python3 compare_backup_fields.py BACKUP_VECCHIO BACKUP_NUOVO",file=sys.stderr)
        return 2
    try:
        before=load(sys.argv[1]);after=load(sys.argv[2])
        print("Differenze per campo (solo conteggi, nessun valore/ID)")
        for key in sorted(before.keys()|after.keys()):
            report(key,before.get(key,[]),after.get(key,[]))
        print("Solo_syncedAt = unicamente timestamp di replica superficiale; altri_modificati non implica modifica operativa.")
        print("Record assenti non implicano cancellazione errata; verificare Firebase attuale.")
        return 0
    except (OSError,ValueError,TypeError,UnicodeError):
        print("ERRORE: backup non leggibile o confronto fallito (dati non mostrati)",file=sys.stderr)
        return 2
if __name__=="__main__":sys.exit(main())
