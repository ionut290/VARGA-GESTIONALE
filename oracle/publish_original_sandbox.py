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
    print("=== CLIENTI, COMMESSE E PREVENTIVI ORACLE DEMO, GRAFICA ORIGINALE ===")
    pub.verify_sources()  # Ensure original CSS is identical on the public web container.
    js=(SRC/(NAME+".js")).read_bytes()
    bridge=(SRC/"section-bridge.js").read_bytes()
    html=pub.load_builder().transform((ROOT/"index.html").read_text(encoding="utf-8"),sandbox=True).encode("utf-8")
    if len(js)>150_000 or len(bridge)>150_000 or len(html)>150_000:
        raise ValueError("Asset oltre limite")
    if b'gestionale_sandbox_20261027' not in js or b'gestionale_backup_20261027' in js:
        raise ValueError("Il client sandbox non usa esclusivamente dati fittizi")
    # Since the 27 October revision-safe refactor, each UI module writes
    # through SectionBridge, never by calling the API client directly.
    # Validate the complete synthetic-only chain before copying ANY assets.
    if not all(token in js for token in (
        b'const ROOT="gestionale_sandbox_20261027"',
        b'new window.VGOracleSectionBridge.SectionBridge',
        b'client:api,workspace:ROOT,keys:["clients","jobs","quotes"],writable:true',
        b'bridge.stage(key,updated)',
        b'await bridge.commit(key)',
        b'await saveDemoSection("clients",{',
        b'await saveDemoSection("jobs",job,"addJob","commesse")',
        b'await saveDemoSection("quotes",quote,"saveQuote","preventivi")',
    )):
        raise ValueError("Adapter e salvataggi DEMO non corrispondono al codice previsto")
    if b'api.saveSection(' in js or b'fetch(' in js:
        raise ValueError("Salvataggi diretti fuori dall'adapter non ammessi")
    if not all(token in bridge for token in (
        b'const SANDBOX="gestionale_sandbox_20261027"',
        b'if(writable && this.workspace!==SANDBOX)',
        b'this.client.saveSection(this.workspace,key,staged)',
    )):
        raise ValueError("Protezione dei dati aziendali non presente nell'adapter")
    if (b'src="/oracle/original-sandbox.js"' not in html or
        b'src="/oracle/section-bridge.js"' not in html or b"firebasejs" in html):
        raise ValueError("Il loader sandbox non è isolato da Firebase")
    if b"gestionale_sandbox_20261027" not in bridge or b"varga-azienda" in bridge:
        raise ValueError("Adapter Oracle non limitato al laboratorio fittizio")
    for name,data in (("section-bridge.js",bridge),(NAME+".js",js),(NAME+".html",html)):
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
    # Verify the *new JavaScript* via HTTPS, not just the unchanged HTML loader.
    # A unique checksum query avoids a cached previous version; it cannot
    # change the document or expose business data.
    script_url=pub.DOMAIN+"/oracle/"+NAME+".js?v="+hashlib.sha256(js).hexdigest()[:16]
    script_req=urllib.request.Request(script_url,headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(script_req,timeout=12) as response:
        script_bytes=response.read(150_001)
        if response.status!=200 or len(script_bytes)>150_000:
            raise ValueError("JavaScript sandbox HTTPS non valido")
    if hashlib.sha256(script_bytes).hexdigest()!=hashlib.sha256(js).hexdigest():
        raise ValueError("JavaScript pubblico non corrisponde alla nuova versione: controllare cache/proxy")
    bridge_url=pub.DOMAIN+"/oracle/section-bridge.js?v="+hashlib.sha256(bridge).hexdigest()[:16]
    with urllib.request.urlopen(urllib.request.Request(bridge_url,headers={"Cache-Control":"no-cache"}),timeout=12) as response:
        served_bridge=response.read(150_001)
        if response.status!=200 or hashlib.sha256(served_bridge).hexdigest()!=hashlib.sha256(bridge).hexdigest():
            raise ValueError("Adapter Oracle HTTPS non corrisponde alla sorgente")
    print("HTML, JavaScript e adapter sezionale pubblici verificati via HTTPS e SHA256.")
    print("SUCCESSO: LABORATORIO CLIENTI, COMMESSE E PREVENTIVI ORACLE PUBBLICATO.")
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
