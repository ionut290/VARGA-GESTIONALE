#!/usr/bin/env bash
# Read-only inventory of running Cantieri services, without secrets or container env.
set -euo pipefail
echo "=== CONTAINER (nomi, immagini e stato) ==="
sudo docker ps --format '{{.Names}} | {{.Image}} | {{.Status}}' | grep -Ei 'varga|cantier|postgres|firebase' || true
echo "=== SERVIZI SYSTEMD CANTIERI ==="
systemctl list-units --all --type=service --no-pager --plain | grep -Ei 'varga|cantier|sync|firestore' || true
echo "=== SORGENTE DATI OPERATIVA ==="
sudo docker exec db-postgres-1 psql -X -qAt -U varga -d varga_cantieri -v ON_ERROR_STOP=1 -c "SELECT collection_name,count(*) FROM public.firestore_documents GROUP BY collection_name ORDER BY collection_name"
echo "=== STATO IMPORTAZIONE (SOLO CONTEGGI) ==="
sudo docker exec db-postgres-1 psql -X -qAt -U varga -d varga_cantieri -v ON_ERROR_STOP=1 -c "SELECT 'storico_20261026',count(*) FROM public.firestore_import_test_20261026"
echo "Nessuna credenziale, configurazione o payload mostrati. Nessuna scrittura."
