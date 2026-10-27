#!/usr/bin/env bash
# Import a Varga Gestionale historical JSON backup into a date-scoped STAGING
# workspace, NEVER the production one. Safe to run with sudo (private files).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
umask 077
if [[ $# -ne 1 ]]; then
  echo "Uso: sudo bash stage_backup.sh /home/ubuntu/gestionale-private/Varga-Gestionale-backup-2026-10-19.json" >&2
  exit 2
fi
if [[ ! -f "$1" || -L "$1" ]]; then
  echo "File non valido o non presente." >&2
  exit 1
fi
backup="$(realpath -- "$1")"
case "$backup" in
  "$(realpath .)"/*) echo "Il backup non deve risiedere nel repository." >&2; exit 1;;
esac
if [[ "$(stat -c '%s' "$backup")" -gt 150000000 ]]; then
  echo "Backup oltre 150 MB: verificare manualmente." >&2; exit 1
fi
chmod 600 "$backup"
echo "=== VALIDAZIONE BACKUP (solo conteggi) ==="
python3 verify_backup.py "$backup"
stamp="$(python3 - "$backup" <<'PY'
import json,sys,re
with open(sys.argv[1],encoding="utf-8") as f: data=json.load(f)
dt=str(data.get("createdAt") or data.get("exported_at") or "")[:10]
if not re.fullmatch(r"20[0-9]{2}-[0-9]{2}-[0-9]{2}",dt):
    raise SystemExit("Backup senza data YYYY-MM-DD affidabile. Nessun import.")
print(dt.replace("-",""))
PY
)"
workspace="gestionale_backup_${stamp}"
if [[ ! "$workspace" =~ ^gestionale_backup_20[0-9]{6}$ ]]; then
 echo "Workspace staging non valido." >&2; exit 1
fi
echo "Workspace destinazione (solo test): $workspace"
echo "=== CONTROLLO API ORACLE ==="
curl --fail --silent --show-error --max-time 8 \
  http://127.0.0.1:18098/api/gestionale/v1/health
printf '\n'
echo "=== PREVENZIONE SOVRASCRITTURA ==="
old="$(docker compose -p vg-gestionale-oracle exec -T db \
 psql -X -U varga_gestionale -d varga_gestionale -Atqc \
 "SELECT (SELECT COUNT(*) FROM vg.workspace_sections WHERE workspace_id='$workspace') + (SELECT COUNT(*) FROM vg.workspaces WHERE id='$workspace' AND revision > 0)")"
if [[ "$old" != "0" ]]; then
  echo "Workspace staging gia' popolato: NON sovrascrivo; mantengo la copia esistente." >&2
  exit 1
fi
sum="$(sha256sum "$backup" | cut -d' ' -f1)"
echo "=== DRY RUN (nessuna scrittura) ==="
docker compose -p vg-gestionale-oracle exec -T api \
 python -m backend.admin import-snapshot --workspace "$workspace" \
 --file - --dry-run < "$backup"
echo "=== IMPORTAZIONE ATOMICA SU STAGING ==="
docker compose -p vg-gestionale-oracle exec -T api \
 python -m backend.admin import-snapshot --workspace "$workspace" \
 --file - --confirm-sha256 "$sum" < "$backup"
echo "=== SEZIONI IMPORTATE ==="
docker compose -p vg-gestionale-oracle exec -T db \
 psql -X -U varga_gestionale -d varga_gestionale -P pager=off -c \
 "SELECT section, CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS elementi FROM vg.workspace_sections WHERE workspace_id='$workspace' ORDER BY section"
echo "COPIA STAGING COMPLETATA. Dati di produzione non modificati."
