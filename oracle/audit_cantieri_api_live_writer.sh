#!/usr/bin/env bash
# Inspect live Cantieri API deployment (read-only; redact configuration).
set -euo pipefail
name=varga-cantieri-api
echo '=== API PROCESS ==='
sudo docker inspect "$name" --format 'Image={{.Config.Image}} WorkingDir={{.Config.WorkingDir}} Command={{json .Config.Cmd}}'
echo '=== SOURCE MOUNTS ==='
sudo docker inspect "$name" --format '{{range .Mounts}}{{println .Type .Source "=>" .Destination}}{{end}}'
echo '=== SOURCE FILE NAMES ==='
sudo docker exec "$name" sh -c 'find /app /srv -maxdepth 3 -type f \( -name "*.js" -o -name "*.mjs" -o -name "package.json" \) 2>/dev/null | grep -v node_modules | head -65' || true
echo '=== API LOG STATUS (LAST 12 LINES, FILTERED) ==='
sudo docker logs --tail 12 "$name" 2>&1 | sed -E 's#(postgres(ql)?://)[^ @]+@#\\1[REDACTED]@#g;s#(password|secret|token|api[_-]?key)([=: ]+)[^ ,]+#\\1\\2[REDACTED]#Ig'
echo '=== OPERATIONAL TABLE ==='
sudo docker exec db-postgres-1 psql -X -qAt -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "SELECT collection_name,count(*) FROM public.firestore_documents GROUP BY collection_name ORDER BY collection_name"
echo 'Read only. No restart or data changes.'
