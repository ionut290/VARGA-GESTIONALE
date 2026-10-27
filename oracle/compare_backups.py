#!/usr/bin/env python3
"""Read-only comparison of two private Varga Gestionale backups.
Prints only aggregate changes, never IDs, record bodies or personal data.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

def load(path):
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 150_000_000:
        raise ValueError("File non trovato, link o dimensione non ammessa")
    obj=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(obj,dict) or obj.get("app")!="Varga Gestionale" or not isinstance(obj.get("data"),dict):
        raise ValueError("Formato backup Varga Gestionale non valido")
    return str(obj.get("createdAt",""))[:10],obj["data"]

def canonical(item):
    return json.dumps(item,sort_keys=True,ensure_ascii=False,separators=(",",":"),allow_nan=False)

def identity(section,item):
    if isinstance(item,(str,int,float,bool)) or item is None:
        return ("value",canonical(item))
    if isinstance(item,dict):
        k="sourcePath" if section=="vcRecords" else "id"
        v=item.get(k)
        if v is not None and str(v):
            return (k,str(v))
    return None

def report(section,a,b):
    if isinstance(a,list) and isinstance(b,list):
        ak=[identity(section,item) for item in a]
        bk=[identity(section,item) for item in b]
        if any(k is None for k in ak+bk):
            return [len(a),len(b),len(b)-len(a),"n.d.","n.d.","n.d.","Identificativo mancante"]
        if max(Counter(ak).values(),default=0)>1 or max(Counter(bk).values(),default=0)>1:
            return [len(a),len(b),len(b)-len(a),"n.d.","n.d.","n.d.","Identificativi duplicati"]
        x=dict(zip(ak,a));y=dict(zip(bk,b))
        common=x.keys()&y.keys()
        changed=sum(canonical(x[k])!=canonical(y[k]) for k in common)
        return [len(a),len(b),len(b)-len(a),len(y.keys()-x.keys()),len(x.keys()-y.keys()),changed,""]
    return ["oggetto" if isinstance(a,dict) else "altro",
            "oggetto" if isinstance(b,dict) else "altro",
            "—","—","—","si" if canonical(a)!=canonical(b) else "no","sezione non-lista"]

def main():
    p=argparse.ArgumentParser(description="Confronta due backup storici, senza divulgare dati")
    p.add_argument("old",type=Path);p.add_argument("new",type=Path)
    args=p.parse_args()
    try:
        olddate,old=load(args.old)
        newdate,new=load(args.new)
        print("Confronto backup:",olddate,"->",newdate)
        print("Sezione | Prima | Dopo | Delta | Nuovi ID | ID assenti | Record modificati | Nota")
        new_total=missing_total=modified_total=0
        for section in sorted(old.keys()|new.keys()):
            fields=report(section,old.get(section,[]),new.get(section,[]))
            print(section," | "," | ".join(map(str,fields)))
            if isinstance(fields[3],int):
                new_total+=fields[3];missing_total+=fields[4];modified_total+=fields[5]
        print("TOTALI (sezioni con ID validi):", "nuovi",new_total,
              "assenti",missing_total,"modificati",modified_total)
        print("ATTENZIONE: assente nel secondo backup NON dimostra eliminazione erronea.")
        print("Gli archivi sono STORICI: confrontarli con Firebase attuale prima del passaggio finale.")
    except (ValueError,TypeError,OSError,UnicodeError,json.JSONDecodeError):
        print("ERRORE: backup non leggibile o formato non valido (dati non mostrati).",file=sys.stderr)
        return 2
    return 0
if __name__=="__main__":
    sys.exit(main())
