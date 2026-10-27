#!/usr/bin/env bash
# Read-only comparison of two imported dated backups; displays counts only.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "=== CONFRONTO STAGING: 15 OTTOBRE / 19 OTTOBRE ==="
docker compose -p vg-gestionale-oracle exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -P pager=off -c "
WITH a AS (
 SELECT section,
   CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS count_a
 FROM vg.workspace_sections WHERE workspace_id='gestionale_backup_20261015'
), b AS (
 SELECT section,
   CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS count_b
 FROM vg.workspace_sections WHERE workspace_id='gestionale_backup_20261019'
)
SELECT COALESCE(a.section,b.section) AS sezione,
       a.count_a AS ottobre_15, b.count_b AS ottobre_19,
       CASE WHEN a.count_a IS NULL OR b.count_b IS NULL THEN NULL
            ELSE b.count_b-a.count_a END AS differenza
FROM a FULL OUTER JOIN b USING(section)
ORDER BY 1;
"
echo "NOTA: conteggi uguali NON dimostrano identita' del contenuto. Non modificato alcun dato."
