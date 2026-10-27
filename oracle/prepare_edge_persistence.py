#!/usr/bin/env python3
"""Prepare permanent Varga Oracle web edge. NO container restart/recreate.
Preserves the live nginx configuration as a readonly bind mount and adds
the existing isolated network to the web Compose declaratively.

The API Compose in this repository already declares the same external network.
All source edits are backed up, validated with Docker Compose before writing,
and refuse unexpected service structures.
"""
from __future__ import annotations
import copy
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

WEB="varga-gestionale-oracle-varga-gestionale-web-1"
API="vg-gestionale-oracle-api-1"
WEB_DIR=Path("/home/ubuntu/varga-gestionale-oracle")
WEB_FILE=WEB_DIR/"compose.oracle.yml"
PRIVATE=Path("/home/ubuntu/gestionale-private")
ASSETS=PRIVATE/"oracle-edge-static"
CONF_TARGET="/etc/nginx/conf.d/default.conf"
ORACLE_TARGET="/usr/share/nginx/html/oracle"
EDGE="vg-gestionale-edge"
SCRIPT_DIR=Path(__file__).resolve().parent

def shell(args,timeout=20):
    r=subprocess.run(args,capture_output=True,text=True,timeout=timeout,check=False)
    if r.returncode:
        raise ValueError("Comando Docker/Compose fallito (dettagli riservati)")
    return r.stdout

def inspect(name):
    obj=json.loads(shell(["docker","inspect",name]))
    if not isinstance(obj,list) or len(obj)!=1:
        raise ValueError("Container non trovato")
    return obj[0]

def block_end(lines,start,indent):
    for i in range(start+1,len(lines)):
        ln=lines[i]
        if ln.strip() and not ln.lstrip().startswith("#"):
            spaces=len(ln)-len(ln.lstrip(" "))
            if spaces<=indent:
                return i
    return len(lines)

def find_key(lines,key,indent,start=0,end=None):
    end=len(lines) if end is None else end
    matches=[i for i in range(start,end)
             if re.fullmatch(r" "*indent+re.escape(key)+r":\s*(?:#.*)?\n?",lines[i])]
    if len(matches)!=1:
        raise ValueError("Chiave Compose non riconosciuta: "+key)
    return matches[0]

def patch_compose(raw):
    if EDGE in raw:
        raise ValueError("File già contiene riferimenti all'edge: verificare prima, non duplico")
    lines=raw.splitlines(keepends=True)
    services=find_key(lines,"services",0)
    services_end=block_end(lines,services,0)
    service=find_key(lines,"varga-gestionale-web",2,services+1,services_end)
    end=block_end(lines,service,2)
    # Refuse any existing volumes: normalised inspect confirmed none in live config.
    if re.search(r"(?m)^    volumes\s*:", "".join(lines[service+1:end])):
        raise ValueError("Volumi web già definiti: serve revisione manuale")
    section=find_key(lines,"networks",4,service+1,end)
    network_line=lines[section]
    if re.fullmatch(r"    networks:\s*\[(?:\s*public_proxy\s*)\]\s*\n?",network_line):
        lines[section]="    networks: [public_proxy, gestionale_edge]\n"
    elif network_line.rstrip()=="    networks:":
        network_end=block_end(lines,section,4)
        if network_end>end:
            network_end=end
        children=lines[section+1:network_end]
        if not children:
            raise ValueError("Rete web vuota")
        stripped=[x.strip() for x in children if x.strip() and not x.lstrip().startswith("#")]
        if "- public_proxy" in stripped and all(x.startswith("- ") for x in stripped):
            lines.insert(network_end,"      - gestionale_edge\n")
        elif "public_proxy:" in stripped and not any(x.startswith("- ") for x in stripped):
            lines.insert(network_end,"      gestionale_edge: {}\n")
        else:
            raise ValueError("La struttura delle reti web non è prevista")
    else:
        raise ValueError("Formato networks del servizio web inatteso")
    # Re-locate service following first insertion, then add the bind mounts.
    services=find_key(lines,"services",0)
    services_end=block_end(lines,services,0)
    service=find_key(lines,"varga-gestionale-web",2,services+1,services_end)
    end=block_end(lines,service,2)
    mounts=[
        "    volumes:\n",
        "      - type: bind\n",
        "        source: /home/ubuntu/gestionale-private/oracle-edge-static/nginx.conf\n",
        "        target: /etc/nginx/conf.d/default.conf\n",
        "        read_only: true\n",
        "      - type: bind\n",
        "        source: /home/ubuntu/gestionale-private/oracle-edge-static/oracle\n",
        "        target: /usr/share/nginx/html/oracle\n",
        "        read_only: true\n",
    ]
    lines[end:end]=mounts
    nets=find_key(lines,"networks",0)
    nets_end=block_end(lines,nets,0)
    lines[nets_end:nets_end]=[
        "  gestionale_edge:\n",
        "    external: true\n",
        "    name: vg-gestionale-edge\n",
    ]
    return "".join(lines)

def compose_config(file):
    data=json.loads(shell(["docker","compose","--project-directory",str(WEB_DIR),
                          "-f",str(file),"config","--format","json"],timeout=25))
    return data

def validate_diff(before,after):
    left=copy.deepcopy(before);right=copy.deepcopy(after)
    old_services=left.get("services")
    new_services=right.get("services")
    if not isinstance(old_services,dict) or not isinstance(new_services,dict):
        raise ValueError("Compose servizi non validi")
    if old_services.keys()!=new_services.keys():
        raise ValueError("La patch modifica l'elenco servizi")
    key="varga-gestionale-web"
    old=old_services[key];new=new_services[key]
    for name in old_services:
        if name!=key and old_services[name]!=new_services[name]:
            raise ValueError("La patch modifica altri servizi Docker")
    old_nets=old.get("networks") or {}
    new_nets=new.get("networks") or {}
    if not isinstance(old_nets,dict) or not isinstance(new_nets,dict):
        raise ValueError("Reti Compose non normalizzate")
    if set(new_nets)!=set(old_nets)|{"gestionale_edge"}:
        raise ValueError("Differenze inattese nelle reti web")
    for name in old_nets:
        if old_nets[name]!=new_nets[name]:
            raise ValueError("Rete web esistente modificata")
    old.pop("networks",None);new.pop("networks",None)
    old_mounts=old.pop("volumes",[])
    new_mounts=new.pop("volumes",[])
    if old_mounts:
        raise ValueError("Montaggi originali non previsti")
    if len(new_mounts)!=2 or not all(isinstance(m,dict) and
                                     m.get("type")=="bind" and
                                     m.get("read_only") is True for m in new_mounts):
        raise ValueError("Volumi aggiunti non validi")
    expected={(str(ASSETS/"nginx.conf"),CONF_TARGET),
              (str(ASSETS/"oracle"),ORACLE_TARGET)}
    found={(m.get("source"),m.get("target")) for m in new_mounts}
    if found!=expected:
        raise ValueError("Destinazioni mount inattese")
    if old!=new:
        raise ValueError("Servizio web cambiato oltre reti e montaggi")
    left.pop("services",None);right.pop("services",None)
    old_top=left.get("networks") or {}
    new_top=right.get("networks") or {}
    if set(new_top)!=set(old_top)|{"gestionale_edge"}:
        raise ValueError("Altre reti Compose modificate")
    edge=new_top["gestionale_edge"]
    if not (isinstance(edge,dict) and edge.get("external") is True and edge.get("name")==EDGE):
        raise ValueError("Edge non impostato come esterno")
    for name in old_top:
        if old_top[name]!=new_top[name]:
            raise ValueError("Rete preesistente modificata")
    left.pop("networks",None);right.pop("networks",None)
    if left!=right:
        raise ValueError("Differenza inattesa nel progetto Compose")
    print("DIFF COMPOSE: soltanto rete edge e due montaggi readonly; verificato")

def verify_sources():
    for path in (WEB_FILE,PRIVATE):
        if path.is_symlink() or not path.exists():
            raise ValueError("Percorso privato/Compose assente o symlink")
    live=inspect(WEB);api=inspect(API)
    for info,label in ((live,"web"),(api,"api")):
        if not (info.get("State") or {}).get("Running"):
            raise ValueError("Container "+label+" non attivo")
        networks=(info.get("NetworkSettings") or {}).get("Networks") or {}
        if EDGE not in networks:
            raise ValueError("Rete edge non collegata attualmente a "+label)
    expected_label="/home/ubuntu/varga-gestionale-oracle/compose.oracle.yml"
    labels=(live.get("Config") or {}).get("Labels") or {}
    if labels.get("com.docker.compose.project.config_files")!=expected_label:
        raise ValueError("Web container proveniente da un Compose non previsto")
    net=json.loads(shell(["docker","network","inspect",EDGE]))
    if len(net)!=1 or net[0].get("Internal") is not True or net[0].get("Driver")!="bridge":
        raise ValueError("Edge network non sicura")
    return live

def prepare_assets():
    ASSETS.mkdir(mode=0o755,exist_ok=True)
    os.chmod(ASSETS,0o755)
    folder=ASSETS/"oracle"
    folder.mkdir(mode=0o755,exist_ok=True)
    os.chmod(folder,0o755)
    originals=[("pilot.html","pilot.html"),("client.js","client.js"),("browser-export.js","browser-export.js")]
    for src,dest in originals:
        source=SCRIPT_DIR/src
        target=folder/dest
        if not source.is_file() or source.is_symlink():
            raise ValueError("Asset sorgente mancante")
        if target.is_symlink():
            raise ValueError("Asset destinazione è symlink")
        if target.exists() and target.read_bytes()!=source.read_bytes():
            raise ValueError("Asset già presente ma diverso: non sovrascrivo")
        if not target.exists():
            target.write_bytes(source.read_bytes())
        os.chmod(target,0o644)
    nginx=ASSETS/"nginx.conf"
    if nginx.exists() or nginx.is_symlink():
        raise ValueError("Configurazione Nginx persistente esiste già: esaminare prima")
    # Capture the live, already proven-to-work config. Never display its contents.
    data=subprocess.run(["docker","cp",WEB+":"+CONF_TARGET,str(nginx)],
                        check=False,capture_output=True,timeout=15)
    if data.returncode!=0:
        raise ValueError("Backup Nginx persistente non riuscito")
    conf=nginx.read_text(encoding="utf-8")
    if not all(x in conf for x in ("VG_ORACLE_EDGE_20261027",
        "location ^~ /api/gestionale/v1/",
        "proxy_pass http://vg-gestionale-oracle-api-1:8098;")):
        nginx.unlink(missing_ok=True)
        raise ValueError("Config Nginx in esecuzione non riconosciuta")
    os.chmod(nginx,0o644)
    print("Nginx e 3 asset pubblici salvati in cartella permanente, nessuna modifica al container")

def main():
    print("=== PREPARA PERSISTENZA ORACLE EDGE, SENZA RIAVVII ===")
    verify_sources()
    raw=WEB_FILE.read_text(encoding="utf-8")
    new_text=patch_compose(raw)
    orig=compose_config(WEB_FILE)
    tmp_file=WEB_DIR/(".compose.oracle.edge-check-"+str(os.getpid())+".yml")
    if tmp_file.exists() or tmp_file.is_symlink():
        raise ValueError("File provvisorio già esistente")
    with tmp_file.open("x",encoding="utf-8") as t:
        t.write(new_text)
    try:
        patched=compose_config(tmp_file)
        validate_diff(orig,patched)
    finally:
        tmp_file.unlink(missing_ok=True)
    api_config=compose_config(SCRIPT_DIR/"compose.yaml")
    if "gestionale_edge" not in api_config.get("services",{}).get("api",{}).get("networks",{}):
        raise ValueError("API Compose GitHub non dichiara la rete permanente")
    # Prepare assets first, before modifying existing web Compose. All operations
    # that can fail during validation have completed at this point.
    prepare_assets()
    backup_dir=PRIVATE/"compose-backups"
    backup_dir.mkdir(mode=0o700,exist_ok=True)
    os.chmod(backup_dir,0o700)
    marker=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup=backup_dir/("compose.oracle.before-edge-"+marker+".yml")
    with backup.open("x",encoding="utf-8") as t:
        t.write(raw)
    os.chmod(backup,0o600)
    meta=WEB_FILE.stat()
    tmp=WEB_DIR/(".compose.oracle.new-"+str(os.getpid())+".yml")
    with tmp.open("x",encoding="utf-8") as t:
        t.write(new_text)
        t.flush();os.fsync(t.fileno())
    os.chmod(tmp,stat.S_IMODE(meta.st_mode))
    os.chown(tmp,meta.st_uid,meta.st_gid)
    os.replace(tmp,WEB_FILE)
    print("WEB COMPOSE SALVATO: edge e mount statici readonly persistenti")
    print("API COMPOSE: edge già dichiarato nel repository")
    print("CONFIGURAZIONI SALVATE. CONTAINER ATTUALI NON RIAVVIATI O RICREATI.")
    print("AVVISO: per nuovi deploy usare i Compose aggiornati; conservare backup privato.")

if __name__=="__main__":
    try:
        main()
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError,
            subprocess.TimeoutExpired,UnicodeError) as exc:
        print("STOP: predisposizione non completata:",str(exc),file=sys.stderr)
        print("Nessun container è stato riavviato.",file=sys.stderr)
        sys.exit(2)
