#!/usr/bin/env bash
# One complete refresh: current Cantieri sync projection -> Oracle staging -> isolated preview workspace.
set -euo pipefail
cd /home/ubuntu/gestionale-oracle-stage
bash oracle/sync_cantieri_current_to_stage.sh
bash oracle/map_cantieri_stage_to_workspace.sh
echo "CICLO COMPLETO: staging Oracle e workspace isolato aggiornati."
