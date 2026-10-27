#!/usr/bin/env python3
"""Read-only, privacy-safe gateway diagnosis for the Varga Gestionale API.
Never prints HTTP bodies, Docker environment variables, certificates, keys,
full proxy configurations, or business records.
"""
import json
import re
import shutil
import subprocess
import urllib.request

DOMAIN = "gestionale.radio-romanii-italia.duckdns.org"
PATH = "/api/gestionale/v1/health"
WEB_CONTAINER = "varga-gestionale-oracle-varga-gestionale-web-1"

def run(cmd, maxsize=2_000_000):
    try:
        completed=subprocess.run(cmd,capture_output=True,timeout=12,check=False)
        stdout=completed.stdout[:maxsize].decode("utf-8","replace")
        return completed.returncode,stdout
    except (OSError,subprocess.TimeoutExpired):
        return -1,""

def check_http(label,url):
    try:
        req=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"VG-Oracle-Gateway-Diagnostic/1"})
        with urllib.request.urlopen(req,timeout=8) as response:
            status=response.status
            kind=(response.headers.get("content-type","").split(";")[0]).strip()
            body=response.read(500)
        ready=False
        if kind=="application/json":
            try:
                data=json.loads(body)
                ready=isinstance(data,dict) and data.get("service")=="varga-gestionale" and data.get("ready") is True
            except (ValueError,UnicodeError):
                pass
        print("%s: HTTP=%d type=%s service_ready=%s" % (label,status,kind or "-",str(ready).lower()))
    except Exception:
        print("%s: endpoint non raggiungibile / status non 2xx" % label)

def config_summary(label,cmd):
    code,contents=run(cmd,maxsize=5_000_000)
    if code!=0:
        print(label+": config nginx non leggibile/non disponibile")
        return
    domains=re.findall(r"(?m)^\s*server_name\s+([^;]+);",contents)
    matched=any(DOMAIN in line.split() for line in domains)
    api_location=bool(re.search(r"(?m)^\s*location\s+(?:=|~\*?|~)?\s*/api/gestionale(?:/v1)?(?:/|\s|$)",contents))
    upstream=bool(re.search(r"(?m)^\s*proxy_pass\s+https?://(?:127\.0\.0\.1|localhost|host\.docker\.internal|[A-Za-z0-9_.-]+):(?:18098|8098)",contents))
    print("%s: target_server_name=%s api_location=%s proxy_to_18098_or_8098=%s" %
          (label,str(matched).lower(),str(api_location).lower(),str(upstream).lower()))

def main():
    print("=== DIAGNOSI GATEWAY ORACLE / SOLO LETTURA ===")
    check_http("api_locale","http://127.0.0.1:18098"+PATH)
    check_http("api_https","https://"+DOMAIN+PATH)
    rc,raw=run(["docker","ps","--format","{{.Names}}|{{.Image}}|{{.Ports}}"])
    if rc==0:
        print("=== CONTAINER WEB / PROXY ===")
        for line in raw.splitlines():
            parts=line.split("|",2)
            if len(parts)!=3:
                continue
            name,image,ports=parts
            if any(word in (name+" "+image).lower() for word in ("gestionale","nginx","caddy","traefik","haproxy","proxy")) or "0.0.0.0:443" in ports or "0.0.0.0:80" in ports:
                # Ports, container name/image are nonsecret. Never display env or mounts.
                print(name+" | "+image[:60]+" | "+ports[:160])
        rc2,webroot=run(["docker","exec",WEB_CONTAINER,"sh","-c",
             "test -f /usr/share/nginx/html/index.html && echo present"])
        print("gestionale_webroot_index: "+("present" if rc2==0 and "present" in webroot else "non verificato"))
        rc3,asset=run(["docker","exec",WEB_CONTAINER,"sh","-c",
             "test -f /usr/share/nginx/html/oracle/pilot.html && echo present"])
        print("gestionale_pilot_asset: "+("present" if rc3==0 and "present" in asset else "assente"))
        config_summary("nginx_container_web",["docker","exec",WEB_CONTAINER,"nginx","-T"])
    else:
        print("Docker non disponibile con questi permessi.")
    if shutil.which("nginx"):
        config_summary("nginx_host",["nginx","-T"])
    else:
        print("nginx_host: eseguibile non trovato (potrebbe essere in container)")
    if shutil.which("ss"):
        rc,sockets=run(["ss","-H","-ltn"])
        found=set()
        for line in sockets.splitlines():
            words=line.split()
            if len(words)>=4:
                local=words[3]
                if re.search(r":(80|443|18098)$",local):
                    found.add(local.rsplit(":",1)[-1])
        print("porte_in_ascolto_server:",",".join(sorted(found)) if found else "non determinate")
    print("DIAGNOSI FINITA. Nessuna configurazione o dato modificato.")

if __name__=="__main__":
    main()
