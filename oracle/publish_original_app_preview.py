#!/usr/bin/env python3
"""Publish an original-markup Varga copy isolated to the Oracle test workspace.

Only versioned files below /oracle/ are added or replaced. The site root, Firebase,
the original app, the radio containers, and production databases are not changed.
"""
from __future__ import annotations
from datetime import datetime,timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
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
WORKSPACE="gestionale_cantieri_sync_20261027"
SKIP={"app-sync.js","shared-auth-policy.js","cloud-users.js","password-recovery-code.js",
      "app-cloud.js","job-management-sync.js","cloud-incremental-sync.js",
      "job-plant-management.js","squadre-management-sync.js","map-mail-bridge.js",
      "drive-manager.js","drive-document-lifecycle.js","user-document-assets.js"}

def run(args,timeout=30):
    result=subprocess.run(args,check=False,capture_output=True,timeout=timeout)
    if result.returncode:raise ValueError("Operazione Docker non riuscita; dettagli omessi")
    return result.stdout.decode("utf-8","replace")

def checksum(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def verify_sources():
    if not PERSIST.is_dir() or PERSIST.is_symlink():raise ValueError("Cartella persistente Oracle non pronta")
    for name in ("index.html","style.css","view-scenes.js"):
        path=ROOT/name
        if not path.is_file() or path.is_symlink():raise ValueError("Sorgente originale mancante")
    state=json.loads(run(["docker","inspect",WEB]))
    if len(state)!=1 or not state[0]["State"]["Running"]:raise ValueError("Container web Oracle non operativo")
    for name in ("style.css","view-scenes.js"):
        served=run(["docker","exec",WEB,"sha256sum",WEB_ROOT+"/"+name]).split()[0]
        if served!=checksum(ROOT/name):raise ValueError("Risorsa originale diversa sul server: "+name)
    req=urllib.request.Request(DOMAIN+"/api/gestionale/v1/health",headers={"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=10) as response:
        if response.headers.get("Content-Type","").split(";")[0]!="application/json":raise ValueError("API Oracle non disponibile")
        health=json.loads(response.read(500))
    if health.get("ready") is not True or health.get("service")!="varga-gestionale":raise ValueError("API Oracle non pronta")
    print("CSS e scene originali verificati; API Oracle pronta.")

def module_files():
    bootstrap=(SRC/"original-app-bootstrap.js").read_text(encoding="utf-8")
    match=re.search(r"const modules=(\[[\s\S]*?\]);",bootstrap)
    if not match:raise ValueError("Elenco moduli originali non riconosciuto")
    all_names=re.findall(r'"([^"\n]+\.js)"',match.group(1))
    chosen=[name for name in all_names if name not in SKIP]
    if not chosen or chosen[0]!="app-core.js":raise ValueError("Bootstrap moduli non valido")
    for name in chosen:
        path=ROOT/name
        if not re.fullmatch(r"[A-Za-z0-9_./-]+\.js",name) or ".." in name or not path.is_file() or path.is_symlink():
            raise ValueError("Modulo originale mancante o non valido: "+name)
    return chosen

def bundle_sources():
    files={name:ROOT/name for name in module_files()}
    files["original-app-bootstrap.js"]=SRC/"original-app-bootstrap.js"
    files["original-app-adapter.js"]=SRC/"original-app-adapter.js"
    files["vendor/exceljs.min.js"]=ROOT/"vendor/exceljs.min.js"
    total=0;digest=hashlib.sha256()
    for name,path in sorted(files.items()):
        if not path.is_file() or path.is_symlink():raise ValueError("Asset bundle non valido: "+name)
        size=path.stat().st_size
        if size>5_000_000:raise ValueError("Asset bundle oltre il limite: "+name)
        total+=size;digest.update(name.encode());digest.update(bytes.fromhex(checksum(path)))
    if total>25_000_000:raise ValueError("Bundle originale oltre 25 MB")
    return files,digest.hexdigest()[:16]

def load_builder():
    spec=importlib.util.spec_from_file_location("vg_original_app_builder",SRC/"build_original_app_preview.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def save_atomic(dst,data):
    if dst.is_symlink():raise ValueError("Destinazione persistente symlink, operazione annullata")
    if dst.exists() and dst.is_file() and dst.read_bytes()==data:return
    backup=Path("/home/ubuntu/gestionale-private/oracle-ui-backups");backup.mkdir(mode=0o700,exist_ok=True)
    if dst.exists():
        stamp=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ");previous=backup/(dst.name+"."+stamp+".bak")
        if previous.exists():raise ValueError("Backup con lo stesso nome già presente")
        shutil.copyfile(dst,previous);os.chmod(previous,0o600)
    fd,temp=tempfile.mkstemp(prefix="."+dst.name+".",dir=dst.parent)
    try:
        with os.fdopen(fd,"wb") as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
        os.chmod(temp,0o644);os.replace(temp,dst)
    finally:
        if os.path.exists(temp):os.unlink(temp)

def prepare_bundle(files,digest):
    target=PERSIST/("original-app-"+digest)
    if target.is_symlink():raise ValueError("Bundle persistente symlink, operazione annullata")
    if target.exists():
        for name,path in files.items():
            out=target/name
            if not out.is_file() or out.is_symlink() or checksum(out)!=checksum(path):raise ValueError("Bundle Oracle già presente ma diverso")
        return target
    temp=Path(tempfile.mkdtemp(prefix=".original-app-",dir=PERSIST))
    try:
        for name,path in files.items():
            dest=temp/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,dest);os.chmod(dest,0o644)
        os.rename(temp,target)
    finally:
        if temp.exists():shutil.rmtree(temp)
    return target

def publish_bundle(bundle,digest,files):
    name="original-app-"+digest;dest=WEB_ROOT+"/oracle/"+name
    run(["docker","exec",WEB,"mkdir","-p",WEB_ROOT+"/oracle"])
    exists=subprocess.run(["docker","exec",WEB,"test","-d",dest],check=False,capture_output=True).returncode==0
    if not exists:
        run(["docker","cp",str(bundle),WEB+":"+WEB_ROOT+"/oracle/"],timeout=120)
    for rel,path in files.items():
        got=run(["docker","exec",WEB,"sha256sum",dest+"/"+rel]).split()[0]
        if got!=checksum(path):raise ValueError("Verifica bundle in container fallita: "+rel)
    print("Bundle originale isolato: "+str(len(files))+" asset, SHA256 verificati.")

def publish_page(digest):
    generated=load_builder().transform((ROOT/"index.html").read_text(encoding="utf-8"))
    generated=generated.replace('/oracle/original-app-bootstrap.js','/oracle/original-app-'+digest+'/original-app-bootstrap.js')
    if "firebasejs" in generated.lower() or "connect-src 'self'" not in generated:raise ValueError("HTML Oracle non isolato")
    data=generated.encode("utf-8");path=PERSIST/"original-app.html";save_atomic(path,data)
    run(["docker","cp",str(path),WEB+":"+WEB_ROOT+"/oracle/original-app.html"])
    if run(["docker","exec",WEB,"sha256sum",WEB_ROOT+"/oracle/original-app.html"]).split()[0]!=checksum(path):raise ValueError("HTML pubblicato diverso")
    url=DOMAIN+"/oracle/original-app.html"
    with urllib.request.urlopen(urllib.request.Request(url,headers={"Cache-Control":"no-cache"}),timeout=15) as response:
        page=response.read(150_000).decode("utf-8","strict")
        expected='/oracle/original-app-'+digest+'/original-app-bootstrap.js'
        if response.status!=200 or expected not in page or "firebasejs" in page.lower() or 'href="style.css?' not in page:
            raise ValueError("Pagina Oracle pubblica diversa dalla copia verificata")
    print("COPIA ORIGINALE ONLINE: "+url)

def main():
    print("=== COPIA ORIGINALE VARGA · WORKSPACE ORACLE DI PROVA ===")
    verify_sources();files,digest=bundle_sources();bundle=prepare_bundle(files,digest)
    publish_bundle(bundle,digest,files);publish_page(digest)
    print("Markup e CSS originali; dati e memoria browser isolati; salvataggi sul workspace Oracle di prova.")
    print("Firebase, Firestore, Drive e Calendar di produzione non vengono inizializzati da questa copia.")

if __name__=="__main__":
    try:main()
    except (OSError,ValueError,TypeError,UnicodeError,KeyError,subprocess.TimeoutExpired,
            json.JSONDecodeError) as error:
        print("STOP COPIA ORACLE: "+str(error),file=sys.stderr);sys.exit(2)
