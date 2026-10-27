#!/usr/bin/env bash
# Varga Gestionale: private web <-> API edge, without touching AzuraCast.
# Designed for the verified October 27 topology. No Docker restarts.
# Changes are only on two Varga containers and an isolated Docker network.
set -euo pipefail
umask 077
readonly WEB="varga-gestionale-oracle-varga-gestionale-web-1"
readonly API="vg-gestionale-oracle-api-1"
readonly EDGE="vg-gestionale-edge"
readonly CONF="/etc/nginx/conf.d/default.conf"
readonly DOMAIN="https://gestionale.radio-romanii-italia.duckdns.org"
readonly HEALTH="/api/gestionale/v1/health"
readonly PRIVATE="/home/ubuntu/gestionale-private"
cd "$(dirname "$0")"

temp="$(mktemp -d /tmp/vg-oracle-edge.XXXXXXXX)"
rollback_needed=0
cleanup() {
  local status=$?
  if (( status != 0 )) && (( rollback_needed == 1 )); then
    echo "=== RIPRISTINO NGINX DOPO ERRORE ===" >&2
    docker cp "$temp/original.conf" "$WEB:$CONF" >/dev/null 2>&1 || true
    docker exec "$WEB" nginx -t >/dev/null 2>&1 &&
      docker exec "$WEB" nginx -s reload >/dev/null 2>&1 || true
  fi
  rm -rf "$temp"
}
trap cleanup EXIT

echo "=== PRECONDIZIONI: SOLO CONTAINER VARGA ==="
for container in "$WEB" "$API"; do
  state="$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)"
  if [[ "$state" != "true" ]]; then
    echo "STOP: container $container non attivo, nessuna modifica nginx." >&2
    exit 2
  fi
done
if [[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$WEB")" == "true" ]]; then
  echo "STOP: filesystem web in sola lettura; occorre deployment differente." >&2
  exit 2
fi
if ! docker exec "$WEB" test -f "$CONF"; then
  echo "STOP: configurazione web inattesa, $CONF assente." >&2
  exit 2
fi
if [[ ! -s pilot.html || ! -s client.js ]]; then
  echo "STOP: file di collaudo Oracle mancanti nel repository." >&2
  exit 2
fi
if [[ ! -d "$PRIVATE" ]]; then
  echo "STOP: cartella privata non trovata." >&2
  exit 2
fi
docker cp "$WEB:$CONF" "$temp/original.conf"
python3 patch_nginx_oracle.py "$temp/original.conf" "$temp/patched.conf"

echo "=== BACKUP PERSISTENTE DELLA CONFIGURAZIONE WEB ==="
backupdir="$PRIVATE/nginx-web-backups"
install -d -m 700 "$backupdir"
backup="$backupdir/varga-web-before-oracle-$(date -u +%Y%m%dT%H%M%SZ).conf"
cp -n "$temp/original.conf" "$backup"
chmod 600 "$backup"
echo "Backup Nginx nella cartella privata creato."

echo "=== CREO RETE INTERNA DEDICATA ==="
if ! docker network inspect "$EDGE" >/dev/null 2>&1; then
  docker network create --driver bridge --internal "$EDGE" >/dev/null
fi
network_mode="$(docker network inspect --format '{{.Driver}}|{{.Internal}}|{{.Scope}}' "$EDGE")"
if [[ "$network_mode" != "bridge|true|local" ]]; then
  echo "STOP: rete già esistente ma con parametri non sicuri." >&2
  exit 2
fi
for container in "$WEB" "$API"; do
  if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "$container" |
      grep -Fq "\"$EDGE\""; then
    docker network connect "$EDGE" "$container"
  fi
done

echo "=== PUBBLICO SOLO I FILE DEL COLLAUDO (NO DATI) ==="
if ! docker exec "$WEB" test -e /usr/share/nginx/html/oracle/pilot.html; then
  docker exec "$WEB" mkdir -p /usr/share/nginx/html/oracle
  docker cp pilot.html "$WEB:/usr/share/nginx/html/oracle/pilot.html"
fi
if ! docker exec "$WEB" test -e /usr/share/nginx/html/oracle/client.js; then
  docker exec "$WEB" mkdir -p /usr/share/nginx/html/oracle
  docker cp client.js "$WEB:/usr/share/nginx/html/oracle/client.js"
fi

echo "=== TEST NGINX CON RIPRISTINO AUTOMATICO SE FALLISCE ==="
rollback_needed=1
docker cp "$temp/patched.conf" "$WEB:$CONF"
if ! docker exec "$WEB" nginx -t >/dev/null 2>&1; then
  echo "STOP: nginx -t fallito. Ripristino la configurazione originale." >&2
  exit 2
fi
docker exec "$WEB" nginx -s reload >/dev/null

echo "=== VERIFICO API E PAGINA LOGIN ==="
python3 - <<'PY'
import json
import time
import urllib.request

def read(url,require_json=False):
    with urllib.request.urlopen(urllib.request.Request(
        url,headers={"Accept":"application/json"}),timeout=12) as r:
        data=r.read(2048)
        content_type=r.headers.get("Content-Type","").split(";")[0]
        if r.status!=200:
            raise RuntimeError("HTTP inatteso")
        if require_json:
            if content_type!="application/json" or json.loads(data).get("ready") is not True:
                raise RuntimeError("Non è la risposta JSON dell'API Oracle")
        elif b"Varga Gestionale" not in data:
            raise RuntimeError("La home del Gestionale è cambiata")
        return content_type
targets=[
 ("site_local","http://127.0.0.1:18086/",False),
 ("api_web_local","http://127.0.0.1:18086/api/gestionale/v1/health",True),
 ("api_https","https://gestionale.radio-romanii-italia.duckdns.org/api/gestionale/v1/health",True),
]
for name,url,want_json in targets:
    for attempt in range(5):
        try:
            typ=read(url,want_json)
            print(name+": HTTP 200, "+typ+", verificato")
            break
        except Exception:
            if attempt==4:
                raise SystemExit("STOP: verifica fallita: "+name)
            time.sleep(1)
PY
rollback_needed=0
echo "SUCCESSO: routing Oracle API raggiungibile, sito web integro."
echo "Nessun container riavviato. Nessun servizio radio modificato."
echo "NOTA: collegamento Docker e config modificata nel container: va reso persistente prima di ricreare i container."
