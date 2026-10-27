#!/usr/bin/env python3
"""Inspect Varga-only Compose services and network/mount persistence, read-only.

Calls docker inspect and docker compose config. Processes environment variables
in memory but NEVER displays env values, raw config, secrets, passwords,
certificates, or host bind source paths. Does NOT inspect AzuraCast.
"""
import json
from pathlib import Path
import subprocess
import sys

TARGETS = (
    ("varga-gestionale-oracle-varga-gestionale-web-1", "WEB"),
    ("vg-gestionale-oracle-api-1", "API"),
)
EDGE="vg-gestionale-edge"

def cmd(args, timeout=18):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                     check=False,timeout=timeout)
    if p.returncode:raise ValueError("Impossibile leggere la configurazione Docker")
    return p.stdout.decode("utf-8","strict")

def one_container(name):
    records=json.loads(cmd(["docker","inspect",name]))
    if not isinstance(records,list) or len(records)!=1:
        raise ValueError("Container Docker non trovato")
    return records[0]

def safe_labels(info):
    label=(info.get("Config") or {}).get("Labels") or {}
    project_dir=label.get("com.docker.compose.project.working_dir")
    files=label.get("com.docker.compose.project.config_files")
    service=label.get("com.docker.compose.service")
    if not (project_dir and files and service):
        raise ValueError("Container non gestito da Compose")
    root=Path(project_dir)
    if not root.is_dir():
        raise ValueError("Cartella Compose non presente")
    paths=[Path(f) for f in files.split(",")]
    if len(paths)!=1 or not paths[0].is_file():
        raise ValueError("Layout di configurazione non previsto")
    return root,paths[0],service

def describe(label,info):
    root,file,service=safe_labels(info)
    conf=json.loads(cmd(["docker","compose","--project-directory",str(root),
                          "-f",str(file),"config","--format","json"]))
    apps=conf.get("services") or {}
    active=apps.get(service)
    if not isinstance(active,dict):
        raise ValueError("Servizio Compose assente")
    networks=active.get("networks") or {}
    if isinstance(networks,list):net_names=networks
    elif isinstance(networks,dict):net_names=list(networks)
    else:raise ValueError("Reti Compose inattese")
    mounts=active.get("volumes") or []
    mount_targets=[]
    for m in mounts:
        if isinstance(m,dict):
            target=m.get("target","")
        elif isinstance(m,str):
            target=m.rsplit(":",1)[-1]
        else:
            continue
        if any(str(target).startswith(prefix) for prefix in (
            "/etc/nginx", "/usr/share/nginx/html", "/app", "/srv"
        )):
            mount_targets.append(str(target))
    running=set((info.get("NetworkSettings") or {}).get("Networks") or {})
    declared_networks=conf.get("networks") or {}
    print(label+"_compose_service="+service)
    print(label+"_compose_networks="+",".join(sorted(net_names)))
    print(label+"_running_networks="+",".join(sorted(running)))
    print(label+"_edge_declared="+str(EDGE in net_names or
         any((isinstance(n,dict) and n.get("name")==EDGE) for n in declared_networks.values())).lower())
    print(label+"_build_defined="+str("build" in active).lower())
    print(label+"_image_defined="+str("image" in active).lower())
    print(label+"_mount_targets="+(",".join(mount_targets) if mount_targets else "nessuno"))
    print(label+"_compose_config_exists=true")
    return service

def main():
    print("=== PERSISTENZA DOCKER VARGA, SOLA LETTURA ===")
    for name,label in TARGETS:
        describe(label,one_container(name))
    print("AZURACAST NON ISPEZIONATO. NESSUNA MODIFICA.")
    print("PRIMA DI RICREARE CONTAINER: correggere i rispettivi Compose e montare nginx.")
    return 0

if __name__=="__main__":
    try:
        sys.exit(main())
    except (OSError,ValueError,TypeError,KeyError,UnicodeError,
            json.JSONDecodeError,subprocess.TimeoutExpired):
        print("STOP: configurazione non leggibile; nessun file modificato.",file=sys.stderr)
        sys.exit(2)
