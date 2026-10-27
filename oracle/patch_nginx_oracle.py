#!/usr/bin/env python3
"""Patch only a known, single-server static Nginx configuration, offline.
Does not read secrets, run nginx or modify Docker.
"""
from pathlib import Path
import re
import sys

API_MARKER = "VG_ORACLE_EDGE_20261027"
API_BLOCK = """
    # VG_ORACLE_EDGE_20261027: route per API Gestionale esclusivamente.
    location ^~ /api/gestionale/v1/ {
        proxy_pass http://vg-gestionale-oracle-api-1:8098;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        client_max_body_size 17m;
        add_header Cache-Control "no-store" always;
    }
"""

def patch(src):
    if API_MARKER in src:
        raise ValueError("Route Oracle già presente: nessuna modifica")
    if "location" not in src or "try_files" not in src:
        raise ValueError("Non è la configurazione SPA riconosciuta")
    if re.search(r"(?m)^\s*proxy_pass\s+",src):
        raise ValueError("Esiste già un proxy: controllare manualmente")
    if re.search(r"(?m)^\s*location\s+.*?/api/gestionale",src):
        raise ValueError("Route API esistente non prevista")
    server=list(re.finditer(r"(?m)^\s*server\s*\{",src))
    if len(server)!=1:
        raise ValueError("Numero di blocchi server inatteso")
    if "/usr/share/nginx/html" not in src and "root html" not in src:
        raise ValueError("Document root inattesa")
    offset=server[0].end()
    out=src[:offset]+"\n"+API_BLOCK+src[offset:]
    if out.count(API_MARKER)!=1 or out.count("proxy_pass")!=1:
        raise ValueError("Generazione route non valida")
    return out

def main():
    if len(sys.argv)!=3:
        raise SystemExit("Uso: python3 patch_nginx_oracle.py originale.conf nuova.conf")
    original=Path(sys.argv[1])
    destination=Path(sys.argv[2])
    if not original.is_file() or original.is_symlink() or original.stat().st_size>1_000_000:
        raise SystemExit("Configurazione sorgente non valida")
    if destination.exists() or destination.is_symlink():
        raise SystemExit("Non sovrascrivo il file destinazione")
    try:
        result=patch(original.read_text(encoding="utf-8"))
    except ValueError as err:
        raise SystemExit("STOP: "+str(err))
    destination.write_text(result,encoding="utf-8")
    print("Configurazione di proxy preparata offline: nginx ancora invariato.")

if __name__=="__main__":
    main()
