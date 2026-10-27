#!/usr/bin/env bash
# Diagnostics only: service state, logs and database writing activity.
set -euo pipefail
echo "=== SERVIZI INDIVIDUATI ==="
for name in varga-cantieri-api varga-gestionale-oracle-varga-gestionale-shadow-1; do
  echo "--- $name ---"
  sudo docker inspect "$name" --format 'State={{.State.Status}} Restarts={{.RestartCount}} Exit={{.State.ExitCode}} Image={{.Config.Image}}' || true
  sudo docker logs --tail 35 "$name" 2>&1 | sed -E 's#(postgres(ql)?://)[^ @]+@#\\1***@#g; s#(password|token|secret|api[_-]?key)([=: ]+)[^ ,]+#\\1\\2[REDACTED]#Ig' || true
done
echo "=== DOCUMENTI NEL POSTGRES CANTIERI ==="
sudo docker exec db-postgres-1 psql -X -At -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "SELECT collection_name,COUNT(*),MAX(updated_at) FROM public.firestore_documents GROUP BY collection_name ORDER BY collection_name"
echo "Nessun servizio riavviato; nessun dato modificato."
