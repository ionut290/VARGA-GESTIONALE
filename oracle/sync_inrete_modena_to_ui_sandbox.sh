#!/usr/bin/env bash
# Refresh current Cantieri source and import only INRETE MODENA into the
# writable Oracle UI sandbox. The Firebase-backed source is read-only here.
set -euo pipefail
cd /home/ubuntu/gestionale-oracle-stage

echo "=== AGGIORNAMENTO SORGENTE VARGA CANTIERI (sola lettura) ==="
flock -x -w 180 /run/lock/varga-cantieri-sync.lock /bin/bash oracle/sync_cantieri_cycle.sh

echo "=== IMPORT MIRATO INRETE MODENA → WORKSPACE ORACLE DI PROVA ==="
sudo docker compose -f oracle/compose.yaml -p vg-gestionale-oracle exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale \
  < oracle/sync_inrete_modena_to_ui_sandbox.sql

echo "Import completato nella sola copia Oracle. Nessuna scrittura a Firebase o Varga Cantieri."
