#!/usr/bin/env bash
# Non-destructive staging validation: check duplicates, identity and the UI destination.
set -euo pipefail
cd "$(dirname "$0")/.."
sudo docker compose -p vg-gestionale-oracle exec -T db psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT COUNT(*) AS stage_total,COUNT(DISTINCT path) AS unique_paths,
COUNT(*) FILTER (WHERE source_snapshot='20260819') AS kept_from_august,
COUNT(*) FILTER (WHERE source_snapshot='20261026') AS from_october
FROM vg.cantieri_source_stage;
SELECT collection_name, COUNT(*) AS docs
FROM vg.cantieri_source_stage
GROUP BY collection_name ORDER BY docs DESC;
SELECT section, CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) END AS existing_records
FROM vg.workspace_sections
WHERE workspace_id='gestionale_candidate_20261027'
AND section IN ('vcCommesse','vcImpianti','vcOre','vcRecords','vcSquadre','vcUtenti')
ORDER BY section;
SELECT COUNT(*) AS candidate_sections FROM vg.workspace_sections
WHERE workspace_id='gestionale_candidate_20261027';
COMMIT;
SQL
echo "Verifica terminata: dati operativi ancora in staging, nessuna modifica alle schermate."
