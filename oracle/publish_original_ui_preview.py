#!/usr/bin/env python3
"""Publish ORIGINAL-LOOK read-only Oracle preview, without touching the live app.

No changes to /index.html, /style.css, production JavaScript, PostgreSQL,
Firebase, Docker Compose, Nginx, radio, or container lifecycle.
It serves a byte-derived copy of the original UI at /oracle/original-preview.html
with only a safe API-specific JS loader (NO Firebase or browser storage).
"""
from __future__ import annotations
from datetime import datetime,timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request

SRC=Path(__file__).resolve().parent
ROOT=SRC.parent
PERSIST=Path("/home/ubuntu/gestionale-private/oracle-edge-static/oracle")
WEB="varga-gestionale-oracle-varga-gestionale-web-1"
WEB_ROOT="/usr/share/nginx/html"
DOMAIN="https://gestionale.radio-romanii-italia.duckdns.org"
ARTIFACTS=("original-preview.js","original-preview-ui.js","original-preview.html")

def run(args,timeout=22):
    result=subprocess.run(args,check=False,capture_output=True,timeout=timeout)
    if result.returncode:
        raise ValueError("Operazione Docker non riuscita, dettagli non stampati")
    return result.stdout.decode("utf-8","replace")

def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify_sources():
    if not PERSIST.is_dir() or PERSIST.is_symlink():
        raise ValueError("Cartella persistente oracle-edge-static non pronta")
    for f in ("index.html","style.css"):
        if not (ROOT/f).is_file():raise ValueError("File grafico originale assente")
    conf=PERSIST.parent/"nginx.conf"
    if not conf.is_file() or conf.is_symlink():
        raise ValueError("Nginx persistente non preparato")
    state=json.loads(run(["docker","inspect",WEB]))
    if len(state)!=1 or not state[0]["State"]["Running"]:
        raise ValueError("Container Varga web non operativo")
    # Fail-closed if the ORIGINAL stylesheet differs on the active website.
    # That would make the preview look different from the approved UI.
    served=run(["docker","exec",WEB,"sha256sum",WEB_ROOT+"/style.css"]).split()[0]
    if served!=checksum(ROOT/"style.css"):
        raise ValueError("CSS pubblicato diverso dal CSS originale: NON pubblico un'anteprima con grafica differente")
    served_scenes=run(["docker","exec",WEB,"sha256sum",WEB_ROOT+"/view-scenes.js"]).split()[0]
    if served_scenes!=checksum(ROOT/"view-scenes.js"):
        raise ValueError("Animazioni originali diverse: preview non pubblicata")
    api_url=DOMAIN+"/api/gestionale/v1/health"
    req=urllib.request.Request(api_url,headers={"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=10) as response:
        if response.headers.get("Content-Type","").split(";")[0]!="application/json":
            raise ValueError("API Oracle HTTPS non restituisce JSON")
        result=json.loads(response.read(300))
    if result.get("ready") is not True or result.get("service")!="varga-gestionale":
        raise ValueError("API Oracle HTTPS non pronta")
    print("Grafica CSS del sito originale: SHA256 identico e verificato")

def load_builder():
    file=SRC/"build_original_ui_preview.py"
    spec=importlib.util.spec_from_file_location("vg_preview_builder",file)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def prepare_html():
    original=(ROOT/"index.html").read_text(encoding="utf-8")
    transformed=load_builder().transform(original)
    if not transformed.startswith("<!doctype html>"):
        raise ValueError("Generatore HTML non valido")
    return transformed.encode("utf-8")

def save_atomic(dst,data):
    if dst.is_symlink():
        raise ValueError("Asset persistente symlink, operazione rifiutata")
    if dst.exists() and dst.is_file() and dst.read_bytes()==data:
        return
    backup=Path("/home/ubuntu/gestionale-private/oracle-ui-backups")
    backup.mkdir(mode=0o700,exist_ok=True)
    if dst.exists():
        stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        previous=backup/(dst.name+"."+stamp+".bak")
        if previous.exists():
            raise ValueError("Nome backup già presente")
        shutil.copyfile(dst,previous)
        os.chmod(previous,0o600)
    fd,temp=tempfile.mkstemp(prefix="."+dst.name+".",dir=dst.parent)
    try:
        with os.fdopen(fd,"wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temp,0o644)
        os.replace(temp,dst)
    finally:
        if os.path.exists(temp):os.unlink(temp)

def publish_live(name,digest):
    asset=SRC/name if name.endswith(".js") else PERSIST/name
    if checksum(asset)!=digest:
        raise ValueError("Contenuto di origine cambiato durante la pubblicazione")
    # docker cp replaces only the exact named asset, never root index or CSS.
    run(["docker","exec",WEB,"mkdir","-p",WEB_ROOT+"/oracle"])
    run(["docker","cp",str(asset),WEB+":"+WEB_ROOT+"/oracle/"+name])
    received=run(["docker","exec",WEB,"sha256sum",WEB_ROOT+"/oracle/"+name]).split()[0]
    if received!=digest:
        raise ValueError("SHA256 asset in container diverso")
    print(name+": asset nel container e su disco identico")

def main():
    print("=== INTERFACCIA ORIGINALE / ANTEPRIMA ORACLE DI SOLA LETTURA ===")
    verify_sources()
    generated=prepare_html()
    script=(SRC/"original-preview.js").read_bytes()
    ui_script=(SRC/"original-preview-ui.js").read_bytes()
    for name,data in (("original-preview.js",script),
                      ("original-preview-ui.js",ui_script),
                      ("original-preview.html",generated)):
        if not data or len(data)>150_000:
            raise ValueError("Asset originale oltre limite")
        dest=PERSIST/name
        save_atomic(dest,data)
        if checksum(dest)!=hashlib.sha256(data).hexdigest():
            raise ValueError("Verifica SHA256 asset persistente fallita")
        publish_live(name,hashlib.sha256(data).hexdigest())
    url=DOMAIN+"/oracle/original-preview.html"
    with urllib.request.urlopen(urllib.request.Request(url,headers={"Cache-Control":"no-cache"}),timeout=12) as response:
        served=response.read(50_000).decode("utf-8","strict")
        if (response.status!=200 or "src=\"/oracle/original-preview-ui.js\"" not in served or
            "src=\"/oracle/original-preview.js\"" not in served or
            "src=\"/view-scenes.js?" not in served or
            "href=\"style.css?" not in served):
            raise ValueError("Preview pubblica diversa dalla sorgente")
    print("SUCCESSO: GRAFICA ORIGINALE ONLINE IN ANTEPRIMA ORACLE.")
    print("URL: "+url)
    print("Sola lettura. Nessuna modifica a Firebase, PostgreSQL, radio e app di produzione.")

if __name__=="__main__":
    try:
        main()
    except (OSError,ValueError,TypeError,UnicodeError,KeyError,
            subprocess.TimeoutExpired,json.JSONDecodeError) as err:
        print("STOP ANTEPRIMA: "+str(err),file=sys.stderr)
        sys.exit(2)
