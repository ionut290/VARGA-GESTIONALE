#!/usr/bin/env bash
# Read-only discovery for Oracle Varga Cantieri -> Gestionale synchronization.
# No replication, no credentials output, no mutations.
set -euo pipefail
cd "$(dirname "$0")"
echo "=== GESTIONALE: SEZIONI CANTIERI GIA' IMPORTATE ==="
docker compose -p vg-gestionale-oracle exec -T db \
 psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -P pager=off -c "
SELECT section, jsonb_typeof(data) AS tipo,
 CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) END AS elementi
FROM vg.workspace_sections
WHERE workspace_id='gestionale_candidate_20261027'
 AND section IN ('vcCommesse','vcImpianti','vcOre','vcRecords','vcSquadre','vcUtenti','vcSegnalazioni')
ORDER BY section;"
echo "=== CANTIERI: INVENTARIO STRUTTURA SORGENTE (SOLA LETTURA) ==="
if ! docker inspect db-postgres-1 --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
 echo "STOP: database Cantieri non disponibile";exit 2
fi
docker exec -i db-postgres-1 psql -X -v ON_ERROR_STOP=1 \
 -U varga -d varga_cantieri -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT table_schema,table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;
SELECT collection_name,COUNT(*) AS documenti
FROM public.pu GROUP BY collection_name ORDER BY collection_name;
COMMIT;
SQL
echo "CONFRONTO PRELIMINARE TERMINATO: nessun dato copiato, modificato o cancellato."
