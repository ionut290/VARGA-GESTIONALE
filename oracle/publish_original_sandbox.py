#!/usr/bin/env python3
"""Publish only original-style Oracle demo sandbox assets, no live-app changes.

Reuses the established safe publisher checks and verified original CSS.
No container recreate/reload. Never touches real Oracle backup or Firebase.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import urllib.request

SRC=Path(__file__).resolve().parent
ROOT=SRC.parent
BASE_FILE=SRC/"publish_original_ui_preview.py"
spec=importlib.util.spec_from_file_location("varga_original_preview_publisher",BASE_FILE)
pub=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pub)
NAME="original-sandbox"

def main():
    print("=== CLIENTI ORACLE DEMO CON LA GRAFICA ORIGINALE ===")
    pub.verify_sources()  # Ensure original CSS is identical on the public web container.
    js=(SRC/(NAME+".js")).read_bytes()
    html=pub.load_builder().transform((ROOT/"index.html").read_text(encoding="utf-8"),sandbox=True).encode("utf-8")
    if len(js)>150_000 or len(html)>150_000:
        raise ValueError("Asset oltre limite")
    if b'gestionale_sandbox_20261027' not in js or b'gestionale_backup_20261027' in js:
        raise ValueError("Il client sandbox non usa esclusivamente dati fittizi")
    if b'api.saveSection(ROOT,"clients",updated)' not in js:
        raise ValueError("Gestione salvataggio clienti demo non presente")
    if b'src="/oracle/original-sandbox.js"' not in html or b"firebasejs" in html:
        raise ValueError("Il loader sandbox non è isolato da Firebase")
    for name,data in ((NAME+".js",js),(NAME+".html",html)):
        destination=pub.PERSIST/name
        pub.save_atomic(destination,data)
        digest=hashlib.sha256(data).hexdigest()
        if pub.checksum(destination)!=digest:
            raise ValueError("Hash del file persistente inatteso")
        pub.publish_live(name,digest)
    url=pub.DOMAIN+"/oracle/"+NAME+".html"
    request=urllib.request.Request(url,headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(request,timeout=12) as response:
        served=response.read(50_000)
        if response.status!=200 or b'src="/oracle/original-sandbox.js"' not in served:
            raise ValueError("Pagina sandbox non disponibile o errata")
    print("SUCCESSO: LABORATORIO CLIENTI ORACLE PUBBLICATO.")
    print("URL: "+url)
    print("Scritture abilitate SOLO nel workspace gestionale_sandbox_20261027, con dati fittizi.")
    print("Originale e backup aziendale invariati. Nessun container o servizio radio riavviato.")

if __name__=="__main__":
    try:
        main()
    except (ValueError,OSError,TypeError,KeyError,UnicodeError,TimeoutError,
            json.JSONDecodeError) as exc:
        print("STOP PUBBLICAZIONE DEMO: "+str(exc),file=sys.stderr)
        sys.exit(2)
