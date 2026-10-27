#!/usr/bin/env python3
"""Publish ONLY the independent Oracle read-only console.

No web restart. No nginx/Compose changes. No Docker image rebuild.
Copies two static files to the persistent Varga-only assets directory and
currently running web container. Validates SHA256 and public HTTPS response.
Does not display passwords, access tokens, or private business records.
"""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime,timezone
import urllib.request
import json

SRC=Path(__file__).resolve().parent
PRIVATE=Path("/home/ubuntu/gestionale-private")
PERSIST=PRIVATE/"oracle-edge-static"/"oracle"
WEB="varga-gestionale-oracle-varga-gestionale-web-1"
ROOT="/usr/share/nginx/html/oracle"
DOMAIN="https://gestionale.radio-romanii-italia.duckdns.org"
FILES=("console.js","console.html")
def run(args,timeout=20):
    completed=subprocess.run(args,capture_output=True,check=False,timeout=timeout)
    if completed.returncode:
        raise ValueError("Comando non riuscito (contenuto non mostrato)")
    return completed.stdout.decode("utf-8","replace")

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def assert_preconditions():
    if PRIVATE.is_symlink() or PERSIST.is_symlink() or not PERSIST.is_dir():
        raise ValueError("Cartella degli asset persistenti assente o non valida")
    if not (PERSIST/"client.js").is_file() or not (PERSIST/"nginx.conf").exists():
        # nginx.conf normally sits at parent level; verify below instead.
        if not (PERSIST/"client.js").is_file() or not (PERSIST.parent/"nginx.conf").is_file():
            raise ValueError("Prima completare la configurazione web persistente")
    data=json.loads(run(["docker","inspect",WEB]))
    if len(data)!=1 or data[0]["State"]["Running"] is not True:
        raise ValueError("Container web non attivo")
    for name in FILES:
        f=SRC/name
        if not f.is_file() or f.is_symlink() or f.stat().st_size>500_000:
            raise ValueError("File statico mancante o troppo grande")
        target=PERSIST/name
        if target.is_symlink():
            raise ValueError("Asset persistente è symlink")
    with urllib.request.urlopen(DOMAIN+"/api/gestionale/v1/health",timeout=9) as response:
        data=json.loads(response.read(300))
    if data.get("ready") is not True or data.get("service")!="varga-gestionale":
        raise ValueError("API Oracle HTTPS non pronta")

def main():
    print("=== PUBBLICAZIONE INTERFACCIA ORACLE SEPARATA ===")
    assert_preconditions()
    backup=PRIVATE/"oracle-console-backups"
    backup.mkdir(mode=0o700,exist_ok=True)
    os.chmod(backup,0o700)
    stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for name in FILES:
        source=SRC/name
        dest=PERSIST/name
        if dest.exists() and digest(dest)!=digest(source):
            preserved=backup/(name+"."+stamp+".bak")
            if preserved.exists():raise ValueError("Backup destinazione già presente")
            shutil.copy2(dest,preserved)
            os.chmod(preserved,0o600)
        if not dest.exists() or digest(dest)!=digest(source):
            staged=PERSIST/("."+name+".new-"+str(os.getpid()))
            if staged.exists() or staged.is_symlink():
                raise ValueError("File staging statico già presente")
            try:
                shutil.copyfile(source,staged)
                os.chmod(staged,0o644)
                os.replace(staged,dest)
            finally:
                if staged.exists():staged.unlink()
        if digest(dest)!=digest(source):
            raise ValueError("Asset persistente non verificato")
        print("Asset persistente:",name,"SHA256 OK")
        # Updating running static container does not reload nginx or change radio.
        run(["docker","exec",WEB,"mkdir","-p",ROOT])
        run(["docker","cp",str(source),WEB+":"+ROOT+"/"+name])
        output=run(["docker","exec",WEB,"sha256sum",ROOT+"/"+name])
        if output.split()[0]!=digest(source):
            raise ValueError("Asset nel container diverso da sorgente")
        print("Asset container:",name,"SHA256 OK")
    req=urllib.request.Request(DOMAIN+"/oracle/console.html",headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=12) as r:
        content=r.read(15_000).decode("utf-8","replace")
        if r.status!=200 or "Gestionale Oracle" not in content or "console.js" not in content:
            raise ValueError("Pagina pubblica diversa da quella prevista")
    print("SUCCESSO: console Oracle raggiungibile via HTTPS.")
    print("Indirizzo: "+DOMAIN+"/oracle/console.html")
    print("SOLA LETTURA: Firebase, PostgreSQL e radio invariati.")
    print("Non ricreare il container web prima della verifica dei montaggi Compose.")

if __name__=="__main__":
    try:
        main()
    except (OSError,ValueError,TypeError,KeyError,IndexError,
            subprocess.TimeoutExpired,UnicodeError,json.JSONDecodeError):
        print("PUBBLICAZIONE INTERROTTA. Controllare asset persistenti; nessun database modificato.",file=sys.stderr)
        sys.exit(2)
