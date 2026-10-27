#!/usr/bin/env bash
# Inspect document distribution and sync freshness; read-only; no row payloads/IDs.
set -euo pipefail
docker exec -i db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT '20261026' AS archivio, collection_name,COUNT(*) AS documenti
FROM public.firestore_import_test_20261026 GROUP BY collection_name
UNION ALL
SELECT '20260819',collection_name,COUNT(*)
FROM public.firestore_import_test_20260819 GROUP BY collection_name
ORDER BY archivio DESC,documenti DESC,collection_name;
SELECT source,COUNT(*) AS records,
COUNT(*) FILTER (WHERE pending) AS in_attesa,
MAX(updated_at) AS ultimo_aggiornamento
FROM public.varga_sync_state GROUP BY source ORDER BY source;
SELECT source,operation,status,COUNT(*) AS eventi,MAX(created_at) AS ultimo_evento
FROM public.varga_sync_outbox GROUP BY source,operation,status ORDER BY source,operation,status;
COMMIT;
SQL
echo "SOLA LETTURA: nessuna migrazione o timer di sincronizzazione avviati."
