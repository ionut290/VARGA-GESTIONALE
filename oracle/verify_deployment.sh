#!/usr/bin/env bash
# Read-only validation for the NEW isolated Varga Gestionale PostgreSQL stack.
# Does not print credentials or any business records.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
echo "=== ORACLE GESTIONALE / CHECK ==="
docker compose -p vg-gestionale-oracle ps --format 'table {{.Name}}\t{{.Status}}'
echo "=== API (solo loopback) ==="
curl -fsS --max-time 8 http://127.0.0.1:18098/api/gestionale/v1/health
printf '\n'
echo "=== ARCHIVI POSTGRESQL (solo conteggi) ==="
docker compose -p vg-gestionale-oracle exec -T db sh -ec '
psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "
SELECT (SELECT count(*) FROM vg.users) AS utenti,
       (SELECT count(*) FROM vg.workspaces) AS workspaces,
       (SELECT count(*) FROM vg.workspace_sections) AS sezioni,
       (SELECT count(*) FROM vg.sessions) AS sessioni;
"
'
echo "=== NESSUN SERVIZIO MODIFICATO ==="
