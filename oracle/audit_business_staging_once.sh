#!/usr/bin/env bash
# One-pass, READ-ONLY production migration assessment. No private row values printed.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
echo "=== ORACLE: verifica dati e prerequisiti ==="
python3 audit_production_cutover.py || rc=$?
if [[ "${rc:-0}" != 2 ]]; then echo "STOP: audit in stato inatteso"; exit 2; fi
echo "=== Sezioni archivio reale (sola lettura) ==="
docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale \
  -P pager=off -c "
SELECT workspace_id,COUNT(*) AS sezioni,
 SUM(CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE 0 END) AS righe
FROM vg.workspace_sections
WHERE workspace_id IN ('gestionale_backup_20261027','gestionale_sandbox_20261027')
GROUP BY workspace_id ORDER BY workspace_id;"
echo "=== Identità dello staging con il file privato riconciliato ==="
snapshot=/home/ubuntu/gestionale-private/Varga-Gestionale-reconciled-2026-10-27.json
if [[ ! -f "$snapshot" || -L "$snapshot" ]]; then
  echo "STOP: copia privata riconciliata non presente; non è consentito migrare i dati reali."
  exit 2
fi
python3 verify_staging_import.py "$snapshot"
echo "STAGING 27 OTTOBRE: IDENTICO ALLA COPIA PRIVATA. Non prova che Firebase sia aggiornato."
echo "Nessuna scrittura nel database, nessuna modifica a Firebase."
