#!/usr/bin/env bash
# Publish Cantieri staging reader to isolated Varga Gestionale API and original preview.
# Never touch Cantieri database, AzuraCast or production Firebase.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== CONTROLLI ==="
services="$(sudo docker compose -p vg-gestionale-oracle config --services)"
printf '%s\n' "$services"
if ! printf '%s\n' "$services" | grep -qx 'api'; then
 echo "STOP: servizio 'api' non riconosciuto, nessun riavvio";exit 2
fi
if ! sudo docker compose -p vg-gestionale-oracle ps --status running --services | grep -qx 'api'; then
 echo "STOP: API gestionale non già attiva; nessuna modifica";exit 2
fi
echo "=== SOLO API GESTIONALE (NESSUN ALTRO SERVIZIO) ==="
sudo docker compose -p vg-gestionale-oracle up -d --no-deps --build api
echo "=== PUBBLICAZIONE INTERFACCIA ORIGINALE ==="
sudo python3 oracle/publish_original_ui_preview.py
echo "=== ENDPOINT RISERVATO (senza credenziali, risposta 401/403 attesa) ==="
http="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 'https://gestionale.radio-romanii-italia.duckdns.org/api/gestionale/v1/workspaces/gestionale_candidate_20261027/cantieri-stage/summary' || true)"
if [ "$http" != '401' ] && [ "$http" != '403' ]; then
 echo "ATTENZIONE: endpoint non protetto correttamente o API non pronta: HTTP $http";exit 3
fi
echo "OK: API staging protetta, UI originale online. Nessun dato scritto in workspace."
