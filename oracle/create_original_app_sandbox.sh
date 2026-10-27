#!/usr/bin/env bash
# Clone the read-only Oracle staging workspace into a separate writable sandbox.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
if [[ ! -f oracle/compose.yaml || ! -f oracle/schema.sql ]]; then
  echo "STOP: Compose/backend Oracle non riconosciuto" >&2
  exit 2
fi
health="$(curl -sS --max-time 8 http://127.0.0.1:18098/api/gestionale/v1/health || true)"
if [[ "$health" != *'"ready":true'* ]]; then
  echo "STOP: API Oracle locale non pronta" >&2
  exit 2
fi
echo "=== COPIA TRANSAZIONALE DELLO STAGING NEL WORKSPACE DI PROVA ==="
docker compose -p vg-gestionale-oracle -f oracle/compose.yaml exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale \
  < oracle/create_original_app_sandbox.sql
echo "Workspace di prova creato e confrontato con lo staging Oracle."
