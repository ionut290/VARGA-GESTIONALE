#!/usr/bin/env python3
"""Read-only routing inspection before exposing the Varga Gestionale Oracle API.

Prints ONLY HTTP status/content type, Docker network names, safe Compose paths,
mount destinations and booleans describing nginx configuration.
Never prints raw nginx configuration, environment, certificates or data.
"""
from __future__ import annotations
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

WEB="varga-gestionale-oracle-varga-gestionale-web-1"
API="vg-gestionale-oracle-api-1"
DOMAIN="gestionale.radio-romanii-italia.duckdns.org"
HEALTH="/api/gestionale/v1/health"

def command(argv,timeout=12):
    try:
        result=subprocess.run(argv,check=False,capture_output=True,timeout=timeout)
        if result.returncode:
            return None
        return result.stdout.decode("utf-8","replace")
    except (OSError,subprocess.TimeoutExpired,UnicodeError):
        return None

def inspect(name):
    raw=command(["docker","inspect",name])
    if not raw:
        return None
    parsed=json.loads(raw)
    return parsed[0] if isinstance(parsed,list) and len(parsed)==1 else None

def networks(obj):
    return sorted((obj.get("NetworkSettings") or {}).get("Networks",{}))

def safe_info(name,obj):
    print(name+"_running="+str(bool((obj.get("State") or {}).get("Running"))).lower())
    print(name+"_networks="+",".join(networks(obj)))
    labels=(obj.get("Config") or {}).get("Labels") or {}
    for key,field in [
        ("com.docker.compose.project.working_dir","compose_working_dir"),
        ("com.docker.compose.project.config_files","compose_config_files"),
    ]:
        val=str(labels.get(key) or "")
        if val and "\n" not in val and len(val)<600:
            print(name+"_"+field+"="+val)
    if name=="web":
        config_mounts=[
            (m.get("Destination",""),m.get("Type",""),bool(m.get("RW")))
            for m in obj.get("Mounts",[])
            if str(m.get("Destination","")).startswith(("/etc/nginx","/usr/share/nginx/html"))
        ]
        print("web_config_or_root_mounts="+json.dumps(config_mounts,ensure_ascii=False))

def request(label,url):
    try:
        req=urllib.request.Request(url,headers={"Accept":"application/json"})
        with urllib.request.urlopen(req,timeout=7) as response:
            body=response.read(500)
            kind=response.headers.get("Content-Type","").split(";")[0]
            is_ready=False
            if kind=="application/json":
                try:
                    parsed=json.loads(body)
                    is_ready=parsed.get("service")=="varga-gestionale" and parsed.get("ready") is True
                except (ValueError,AttributeError):
                    pass
            print(label+"_http="+str(response.status)+" "+kind+" oracle_ready="+str(is_ready).lower())
    except urllib.error.HTTPError as exc:
        print(label+"_http="+str(exc.code)+" (nessun corpo visualizzato)")
    except Exception:
        print(label+"_http=non raggiungibile")

def nginx_summary():
    raw=command(["docker","exec",WEB,"nginx","-T"],timeout=15)
    if raw is None:
        print("web_nginx_config=non_disponibile")
        return
    # Detect routing controls without disclosing any configuration lines.
    print("web_nginx_config=leggibile")
    print("web_nginx_has_api_location="+str(bool(re.search(
        r"(?m)^\s*location\s+(?:=|~\*?|\^~)?\s*/api/gestionale(?:/v1)?(?:/|\s|$)",raw))).lower())
    print("web_nginx_has_spa_fallback="+str(bool(re.search(
        r"try_files\s+[^;]*/index\.html",raw))).lower())
    print("web_nginx_has_proxy_pass="+str(bool(re.search(r"\bproxy_pass\s+",raw))).lower())
    print("web_nginx_lists_public_domain="+str(DOMAIN in raw).lower())

def static_assets():
    for key,filename in [
        ("pilot","/usr/share/nginx/html/oracle/pilot.html"),
        ("oracle_client","/usr/share/nginx/html/oracle/client.js"),
        ("export","/usr/share/nginx/html/oracle/browser-export.js"),
    ]:
        # Check only existence; never print file content.
        result=command(["docker","exec",WEB,"sh","-c",
                       'if test -s "$1"; then echo yes; else echo no; fi',"sh",filename])
        print("web_asset_"+key+"="+("yes" if result and result.strip()=="yes" else "no"))

def main():
    print("=== INSTRADAMENTO GESTIONALE / SOLO LETTURA ===")
    api=inspect(API)
    web=inspect(WEB)
    if not api or not web:
        print("ERRORE: container API o web non identificato; nessuna modifica")
        return 2
    safe_info("api",api)
    safe_info("web",web)
    shared=sorted(set(networks(api))&set(networks(web)))
    print("reti_web_api_condivise="+(",".join(shared) if shared else "NESSUNA"))
    nginx_summary()
    static_assets()
    request("backend_loopback","http://127.0.0.1:18098"+HEALTH)
    request("web_loopback","http://127.0.0.1:18086"+HEALTH)
    request("https_pubblico","https://"+DOMAIN+HEALTH)
    print("NESSUNA MODIFICA a nginx, Docker, radio, API o database.")
    return 0

if __name__=="__main__":
    try:
        sys.exit(main())
    except (ValueError,TypeError,KeyError,json.JSONDecodeError):
        print("DIAGNOSI INTERROTTA: dati Docker inattesi",file=sys.stderr)
        sys.exit(2)
