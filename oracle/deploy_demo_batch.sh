#!/usr/bin/env bash
# DEMO-only staged deploy. No migrations of business data, no Docker restart.
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "STOP: eseguire come sudo; nessuna operazione effettuata" >&2
  exit 2
fi
if [[ ! -f extend_remaining_demo.sql || ! -f publish_original_sandbox.py ]]; then
  echo "STOP: sorgenti di pubblicazione mancanti" >&2
  exit 2
fi
echo "=== CREA SOLO SEZIONI MANCANTI NEL LABORATORIO ==="
docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale \
  < extend_remaining_demo.sql
echo "=== PUBBLICA IL SOLO LABORATORIO ==="
python3 publish_original_sandbox.py
echo "SUCCESSO: schema DEMO e frontend DEMO aggiornati; produzione invariata."
