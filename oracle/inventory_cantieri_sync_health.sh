#!/usr/bin/env bash
# Oracle Cantieri: metadata-only inventory, no payloads, paths or secrets.
set -euo pipefail
docker exec -i db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT 'firestore_documents' AS origine,COUNT(*) AS righe FROM public.firestore_documents
UNION ALL SELECT 'firestore_import_test_20260819',COUNT(*) FROM public.firestore_import_test_20260819
UNION ALL SELECT 'firestore_import_test_20261026',COUNT(*) FROM public.firestore_import_test_20261026
UNION ALL SELECT 'varga_gestionale_shadow',COUNT(*) FROM public.varga_gestionale_shadow
UNION ALL SELECT 'varga_sync_state',COUNT(*) FROM public.varga_sync_state
UNION ALL SELECT 'varga_sync_outbox',COUNT(*) FROM public.varga_sync_outbox
UNION ALL SELECT 'varga_sync_conflicts',COUNT(*) FROM public.varga_sync_conflicts
UNION ALL SELECT 'varga_sync_cursors',COUNT(*) FROM public.varga_sync_cursors;
SELECT collection_name,COUNT(*) AS righe FROM public.firestore_documents
GROUP BY collection_name ORDER BY collection_name;
SELECT source,operation,status,COUNT(*) AS eventi FROM public.varga_sync_outbox
GROUP BY source,operation,status ORDER BY source,operation,status;
SELECT source,pending,COUNT(*) AS righe FROM public.varga_sync_state
GROUP BY source,pending ORDER BY source,pending;
SELECT status,COUNT(*) AS conflitti FROM public.varga_sync_conflicts
GROUP BY status ORDER BY status;
SELECT table_name,column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
('firestore_import_test_20260819','firestore_import_test_20261026')
ORDER BY table_name,ordinal_position;
COMMIT;
SQL
echo "FINE INVENTARIO: nessun record, payload o chiave privata stampati. Nessuna scrittura."
