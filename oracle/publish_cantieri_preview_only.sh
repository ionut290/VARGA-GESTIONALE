#!/usr/bin/env bash
# Publish only the original read-only Cantieri UI. No Docker restart/rebuild.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== API ORACLE GIA' ATTIVA ==="
status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://gestionale.radio-romanii-italia.duckdns.org/api/gestionale/v1/health)"
if [ "$status" != "200" ]; then
 echo "STOP: health API diverso da 200 ($status)";exit 2
fi
echo "=== SOLO PUBBLICAZIONE FILE WEB ==="
sudo python3 oracle/publish_original_ui_preview.py
echo "SUCCESSO: anteprima aggiornata senza riavviare API, Cantieri o radio."
