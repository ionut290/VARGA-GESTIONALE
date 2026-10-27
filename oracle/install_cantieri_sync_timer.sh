#!/usr/bin/env bash
# Install the five-minute timer for the isolated Cantieri -> Gestionale sync.
set -euo pipefail
cd "$(dirname "$0")/.."
repo_root="$(pwd)"
if [ "$repo_root" != "/home/ubuntu/gestionale-oracle-stage" ]; then
  echo "STOP: percorso repository inatteso"; exit 2
fi
for file in oracle/sync_cantieri_cycle.sh oracle/sync_cantieri_current_to_stage.sh \\
            oracle/map_cantieri_stage_to_workspace.sh oracle/map_cantieri_stage_to_workspace.sql; do
  [ -f "$file" ] || { echo "STOP: file richiesto assente: $file"; exit 2; }
done
service=/etc/systemd/system/varga-cantieri-sync.service
timer=/etc/systemd/system/varga-cantieri-sync.timer
if [ -e "$service" ] || [ -e "$timer" ]; then
  echo "STOP: unità con questo nome già esistente; non sovrascrivo"; exit 2
fi
install -m 0644 oracle/varga-cantieri-sync.service "$service"
install -m 0644 oracle/varga-cantieri-sync.timer "$timer"
systemctl daemon-reload
systemctl enable --now varga-cantieri-sync.timer
echo "Timer installato e attivo: un ciclo ogni 5 minuti."
systemctl list-timers --no-pager varga-cantieri-sync.timer
