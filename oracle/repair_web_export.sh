#!/usr/bin/env bash
# Targeted no-restart fix for the missing private browser export asset.
# Changes ONLY the running Varga Gestionale web container, never the DB,
# Firebase, Varga Cantieri, AzuraCast, reverse proxy or Docker Compose.
set -euo pipefail
cd "$(dirname "$0")"
container="varga-gestionale-oracle-varga-gestionale-web-1"
asset="browser-export.js"
site="https://gestionale.radio-romanii-italia.duckdns.org"
echo "=== VARGA GESTIONALE / RIPRISTINO SOLO EXPORT ==="
if [[ ! -s "$asset" ]]; then
  echo "ERRORE: file esportazione non presente in $(pwd)/$asset" >&2; exit 1
fi
if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "ERRORE: il container Varga Gestionale web non esiste. Nessuna modifica." >&2; exit 1
fi
running="$(docker inspect --format '{{.State.Running}}' "$container")"
if [[ "$running" != "true" ]]; then
  echo "ERRORE: container web non attivo. Nessuna modifica." >&2; exit 1
fi
root=""
for d in /usr/share/nginx/html /var/www/html /srv/www /app/public /usr/share/caddy; do
  if docker exec "$container" test -f "$d/app.js" >/dev/null 2>&1 &&
     docker exec "$container" test -f "$d/index.html" >/dev/null 2>&1; then
    root="$d"
    break
  fi
done
if [[ -z "$root" ]]; then
  echo "ERRORE: document root non riconosciuta; nessun file modificato." >&2
  exit 1
fi
echo "Document root trovata: $root"
if ! docker exec "$container" grep -q 'oracle-export' "$root/app.js"; then
  echo "ERRORE: app.js pubblicato non contiene il caricatore Oracle." >&2
  echo "Serve una verifica del deploy frontend; NESSUNA modifica eseguita." >&2
  exit 1
fi
if docker exec "$container" test -e "$root/oracle/browser-export.js"; then
  echo "Il file è già nel container. Non sovrascrivo nulla."
else
  echo "Creo soltanto la cartella oracle per l'asset mancante..."
  docker exec "$container" mkdir -p "$root/oracle"
  echo "Copio SOLO oracle/browser-export.js (nessun riavvio)..."
  docker cp "$asset" "$container:$root/oracle/browser-export.js"
fi
if ! docker exec "$container" test -s "$root/oracle/browser-export.js"; then
  echo "ERRORE: file non leggibile nel container." >&2
  exit 1
fi
echo "Asset nel container: PRESENTE."
status="$(curl -L -s -o /dev/null --max-time 12 -w '%{http_code}' \
  "$site/oracle/browser-export.js?verify=$(date +%s)" || true)"
echo "HTTP sito pubblico: $status"
if [[ "$status" != "200" ]]; then
  echo "ATTENZIONE: file presente nel container, ma il dominio non restituisce HTTP 200." >&2
  echo "Potrebbe esserci un diverso document root/proxy o cache. Non modifico altro." >&2
  exit 2
fi
echo "SUCCESSO: il file di esportazione è accessibile dal dominio."
echo "Apri $site/?oracle-export=1 e usa Ctrl+F5."
echo "NOTA: se il webroot non è un volume persistente, docker cp è temporaneo."
echo "Non è stato cambiato alcun database o servizio."
