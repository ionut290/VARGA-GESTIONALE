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
echo "=== VERIFICA IN SOLA LETTURA (3 FONTI) ==="
python3 prepare_reconciled_stage.py "$recent" "$live" "$output" \
  --earliest "$oldest" --dry-run
if [[ -e "$output" || -L "$output" ]]; then
  echo "=== ARCHIVIO ESISTENTE: VERIFICO IDENTITÀ, NON SOVRASCRIVO ==="
  python3 prepare_reconciled_stage.py "$recent" "$live" "$output" \
    --earliest "$oldest" --verify-existing
else
  echo "=== GENERO COPIA DI PROVA PRIVATA ==="
  python3 prepare_reconciled_stage.py "$recent" "$live" "$output" \
    --earliest "$oldest"
fi

echo "=== VERIFICO SE LO STAGING È GIÀ IMPORTATO ==="
if python3 verify_staging_import.py "$output"; then
  echo "SUCCESSO: STAGING 20261027 GIÀ IMPORTATO E VERIFICATO. Nessuna scrittura eseguita."
  exit 0
else
  result=$?
  if [[ "$result" -ne 3 ]]; then
    echo "STOP: database esistente diverso oppure verifica non riuscita. Nessun import." >&2
    exit "$result"
  fi
fi
echo "=== IMPORTAZIONE ATOMICA SU WORKSPACE DI PROVA VUOTO ==="
bash stage_backup.sh "$output"
echo "=== VERIFICA INTEGRITÀ DOPO L'IMPORT ==="
python3 verify_staging_import.py "$output"
echo "SUCCESSO: RICONCILIAZIONE IMPORTATA SOLO IN staging gestionale_backup_20261027."
echo "Firebase, dati storici, app e servizi radio non modificati."
