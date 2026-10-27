#!/usr/bin/env bash
set -euo pipefail
echo "Controllo sorgente Oracle Cantieri (sola lettura)"
docker exec db-postgres-1 psql -U varga -d varga_cantieri -X -At -c "SELECT collection_name, count(*) FROM public.firestore_documents GROUP BY collection_name ORDER BY collection_name"
echo "Nessun dato modificato."
