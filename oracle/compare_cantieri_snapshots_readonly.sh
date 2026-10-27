#!/usr/bin/env bash
# Inventory ID differences across Cantieri snapshot tables. Read-only.
set -euo pipefail
docker exec -i db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
WITH a AS (
 SELECT collection_name,path,md5(data::text) AS fingerprint FROM public.firestore_import_test_20260819
), b AS (
 SELECT collection_name,path,md5(data::text) AS fingerprint FROM public.firestore_import_test_20261026
), joined AS (
 SELECT COALESCE(a.collection_name,b.collection_name) AS collection_name,
 a.path AS oldpath,b.path AS newpath,a.fingerprint AS oldhash,b.fingerprint AS newhash
 FROM a FULL OUTER JOIN b ON a.path=b.path
)
SELECT collection_name,
 COUNT(*) FILTER (WHERE oldpath IS NULL) AS nuovi,
 COUNT(*) FILTER (WHERE newpath IS NULL) AS assenti_ottobre,
 COUNT(*) FILTER (WHERE oldpath IS NOT NULL AND newpath IS NOT NULL AND oldhash<>newhash) AS diversi,
 COUNT(*) FILTER (WHERE oldpath IS NOT NULL AND newpath IS NOT NULL AND oldhash=newhash) AS invariati
FROM joined GROUP BY collection_name ORDER BY collection_name;
SELECT 'agosto' AS archivio,COUNT(*) AS righe,COUNT(DISTINCT path) AS path_distinti
FROM public.firestore_import_test_20260819
UNION ALL
SELECT 'ottobre',COUNT(*),COUNT(DISTINCT path)
FROM public.firestore_import_test_20261026;
COMMIT;
SQL
echo "CONFRONTO SOLA LETTURA: differenze mostrate per raccolta, nessun documento esposto."
