#!/usr/bin/env bash
# Apply the staged current Cantieri snapshot to a separate Gestionale workspace.
# The original candidate, production and historical source staging are untouched.
set -euo pipefail
cd "$(dirname "$0")/.."
project=vg-gestionale-oracle
echo "=== PREFLIGHT (sola lettura) ==="
sudo docker compose -f oracle/compose.yaml -p "$project" exec -T db \
  psql -X -qAt -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -c \
  "SELECT count(*) FROM vg.cantieri_source_stage WHERE source_snapshot='current_sync'" |
  awk '$1+0 > 0 {ok=1} END {if(!ok) exit 1}' || {
    echo "STOP: nessun dato current_sync, workspace non modificati"; exit 2;
  }
sudo docker compose -f oracle/compose.yaml -p "$project" exec -T db \
  psql -X -qAt -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -c \
  "SELECT count(*) FROM vg.workspace_sections WHERE workspace_id='gestionale_candidate_20261027' AND section IN ('vcCommesse','vcImpianti','vcOre','vcRecords','vcSquadre','vcUtenti','vcSegnalazioni')" |
  awk '$1+0 >= 7 {ok=1} END {if(!ok) exit 1}' || {
    echo "STOP: sezioni candidate incomplete, workspace non modificati"; exit 2;
  }
echo "Dati sorgente e candidato verificati."
echo "=== MAPPATURA ATOMICA IN WORKSPACE ISOLATO ==="
sudo docker compose -f oracle/compose.yaml -p "$project" exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale \
  < oracle/map_cantieri_stage_to_workspace.sql
echo "MAPPATURA COMPLETATA. Il workspace gestionale_candidate_20261027 originale non è stato modificato."
