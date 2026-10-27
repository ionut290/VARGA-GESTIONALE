#!/usr/bin/env bash
# Read-only shadow service audit; no credentials or data exposed.
set -euo pipefail
name=varga-gestionale-oracle-varga-gestionale-shadow-1
echo '=== SERVICE CONFIG / NONSECRET KEYS ==='
sudo docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | sort
echo '=== SYNC FILE READ-ONLY: SQL statements and control flow ==='
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
sudo docker cp "$name:/app/sync.js" "$tmp" >/dev/null
python3 - "$tmp" <<'PY'
from pathlib import Path
import re,sys
lines=Path(sys.argv[1]).read_text().splitlines()
for i,line in enumerate(lines,1):
    if re.search(r'CREATE TABLE|INSERT INTO|ON CONFLICT|SELECT |UPDATE |DELETE |GRANT |ALTER |setInterval|setTimeout|pool\.query|fetch\(|collection|firebase',line,re.I):
        if any(k in line.lower() for k in ('password','token','secret','key=','private')):
            print(f'{i}: [redacted]')
        else: print(f'{i}: {line[:180]}')
PY
echo '=== SHADOW TABLE OWNER IN CANTIERI DATABASE ==='
sudo docker exec db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off -c "SELECT schemaname,tablename,tableowner FROM pg_tables WHERE schemaname='public' AND tablename='varga_gestionale_shadow'"
echo 'Nessun permesso modificato.'
