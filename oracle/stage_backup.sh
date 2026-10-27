#!/usr/bin/env bash
# Import an historical backup into a SEPARATE staging workspace, never the
# production workspace. Credentials/data never printed or committed to Git.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
umask 077
if [[ $# -ne 1 ]]; then
  echo "Uso: sudo bash stage_backup.sh /home/ubuntu/gestionale-private/backup.json" >&2
  exit 2
fi
backup="$(realpath -- "$1")"
workspace="gestionale_backup_20261015"
case "$backup" in
  "$(realpath .)"/*) echo "Il backup non deve risiedere nella cartella del repository." >&2; exit 1;;
esac
if [[ ! -f "$backup" || -L "$backup" ]]; then
  echo "File non valido o non presente." >&2; exit 1
fi
chmod 600 "$backup"
echo "=== VALIDAZIONE BACKUP (nessun dato sensibile mostrato) ==="
python3 verify_backup.py "$backup"
echo "=== CONTROLLO API ORACLE ==="
curl --fail --silent --show-error --max-time 8 http://127.0.0.1:18098/api/gestionale/v1/health
printf '\n'
echo "=== PREVENZIONE SOVRASCRITTURA ==="
old="$(docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -U varga_gestionale -d varga_gestionale -Atqc \
  "SELECT count(*) FROM vg.workspace_sections WHERE workspace_id='gestionale_backup_20261015'" | tr -d '\\r\\n')"
if [[ "$old" != 0 ]]; then
  echo "Esiste gia un archivio nella destinazione di prova: non importo." >&2
  exit 1
fi
sum="$(sha256sum "$backup" | cut -d' ' -f1)"
echo "=== DRY RUN CON VALIDAZIONE IMPORTER ==="
docker compose -p vg-gestionale-oracle exec -T api \
  python -m backend.admin import-snapshot --workspace "$workspace" --file - --dry-run < "$backup"
echo "=== IMPORTAZIONE ATOMICA NEL SOLO WORKSPACE STAGING ==="
docker compose -p vg-gestionale-oracle exec -T api \
  python -m backend.admin import-snapshot --workspace "$workspace" --file - \
  --confirm-sha256 "$sum" < "$backup"
echo "=== SEZIONI IMPORTATE (SOLO CONTEGGIO) ==="
docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -U varga_gestionale -d varga_gestionale -P pager=off -c \
  "SELECT section, CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS elementi FROM vg.workspace_sections WHERE workspace_id='gestionale_backup_20261015' ORDER BY section"
echo "IMPORT COMPLETATO SOLO SU COPIA DI PROVA. Nessun account, Firebase o servizio esistente cambiato."
