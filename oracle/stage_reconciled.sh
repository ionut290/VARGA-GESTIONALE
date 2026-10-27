#!/usr/bin/env bash
# Prepare and import ONLY an isolated October 27 staging workspace.
# All source files must already exist in the VM private directory.
# Never writes to the production workspace, Firebase or existing backup files.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
base="/home/ubuntu/gestionale-private"
oldest="$base/Varga-Gestionale-backup.json"
recent="$base/Varga-Gestionale-backup-2026-10-19.json"
live="$base/Varga-Gestionale-live-2026-10-27.json"
output="$base/Varga-Gestionale-reconciled-2026-10-27.json"
for path in "$oldest" "$recent" "$live"; do
  if [[ ! -f "$path" || -L "$path" ]]; then
    echo "Archivio sorgente assente/non valido: $path" >&2
    exit 1
  fi
done
if [[ -e "$output" || -L "$output" ]]; then
  echo "Snapshot riconciliato già esistente: non sovrascrivo." >&2
  echo "Se era stato già generato, eseguire separatamente stage_backup.sh dopo averlo verificato." >&2
  exit 1
fi
echo "=== VERIFICA IN SOLA LETTURA (3 FONTI) ==="
python3 prepare_reconciled_stage.py "$recent" "$live" "$output" \
  --earliest "$oldest" --dry-run
echo "=== GENERO COPIA DI PROVA PRIVATA ==="
python3 prepare_reconciled_stage.py "$recent" "$live" "$output" \
  --earliest "$oldest"
echo "=== VERIFICA E IMPORT ATOMICO IN SOLO STAGING ==="
bash stage_backup.sh "$output"
echo "RICONCILIAZIONE IMPORTATA SOLO IN staging gestionale_backup_20261027."
echo "Firebase, dati storici, app e servizi radio non modificati."
