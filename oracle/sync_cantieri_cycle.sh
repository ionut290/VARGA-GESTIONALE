#!/usr/bin/env bash
# One complete refresh: current Cantieri projection -> Oracle staging -> read-only
# Cantieri workspace -> selected INRETE MODENA records in the Gestionale sandbox.
set -euo pipefail
cd /home/ubuntu/gestionale-oracle-stage
bash oracle/sync_cantieri_current_to_stage.sh
bash oracle/map_cantieri_stage_to_workspace.sh
sudo docker compose -f oracle/compose.yaml -p vg-gestionale-oracle exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale \
  < oracle/sync_inrete_modena_to_ui_sandbox.sql
echo "CICLO COMPLETO: staging, workspace Cantieri e INRETE MODENA nel Gestionale Oracle aggiornati."
