#!/usr/bin/env bash
# Accurate snapshot comparison by stable path, including collection moves.
# Counts only; read only; no business payload exposed.
set -euo pipefail
docker exec -i db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
WITH old AS (
 SELECT path,collection_name,data FROM public.firestore_import_test_20260819
), new AS (
 SELECT path,collection_name,data FROM public.firestore_import_test_20261026
), compared AS (
 SELECT COALESCE(old.collection_name,new.collection_name) AS collection_name,
 old.path IS NOT NULL AS in_august,new.path IS NOT NULL AS in_october,
 old.collection_name IS DISTINCT FROM new.collection_name AS collection_changed,
 old.data IS DISTINCT FROM new.data AS payload_changed
 FROM old FULL JOIN new USING (path)
)
SELECT collection_name,
 count(*) FILTER (WHERE NOT in_august) AS solo_ottobre,
 count(*) FILTER (WHERE NOT in_october) AS solo_agosto,
 count(*) FILTER (WHERE in_august AND in_october AND NOT collection_changed AND payload_changed) AS modificati,
 count(*) FILTER (WHERE in_august AND in_october AND NOT collection_changed AND NOT payload_changed) AS identici,
 count(*) FILTER (WHERE in_august AND in_october AND collection_changed) AS raccolta_cambiata
FROM compared GROUP BY collection_name ORDER BY collection_name;
SELECT 'conteggio_documenti' AS controllo,
 (SELECT count(*) FROM public.firestore_import_test_20260819) AS agosto,
 (SELECT count(*) FROM public.firestore_import_test_20261026) AS ottobre,
 (SELECT count(*) FROM public.firestore_import_test_20260819 a
   JOIN public.firestore_import_test_20261026 b USING(path)) AS percorsi_comuni;
COMMIT;
SQL
echo "SOLA LETTURA. Le assenze NON autorizzano cancellazioni; gli archivi sono fotografie storiche."
