#!/usr/bin/env bash
# Inspect shadow's exact failing SQL and PostgreSQL privileges. No changes.
set -euo pipefail
name=varga-gestionale-oracle-varga-gestionale-shadow-1
echo '=== SHADOW: CONFIGURAZIONE NON SEGRETA ==='
sudo docker inspect "$name" --format 'Image={{.Config.Image}} Workdir={{.Config.WorkingDir}} NetworkMode={{.HostConfig.NetworkMode}} Restart={{.HostConfig.RestartPolicy.Name}}'
echo '=== SYNC.JS: OPERAZIONE FALLITA (SENZA VARIABILI ENV) ==='
sudo docker cp "$name:/app/sync.js" /tmp/vg-shadow-sync-diagnostic.js
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/vg-shadow-sync-diagnostic.js')
lines=p.read_text().splitlines()
for n in range(max(1,22-7),min(len(lines),22+6)+1):
    line=lines[n-1]
    if any(word in line.lower() for word in ('password','secret','token','private_key')):
        line='[riga riservata]'
    print(f'{n}: {line[:240]}')
p.unlink()
PY
echo '=== DATABASE CANTIERI: ACCESSO SCHEMA (SOLA LETTURA) ==='
sudo docker exec -i db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT n.nspname AS schema,r.rolname AS ruolo,
has_schema_privilege(r.rolname,n.oid,'USAGE') AS usage,
has_schema_privilege(r.rolname,n.oid,'CREATE') AS creazione
FROM pg_namespace n CROSS JOIN pg_roles r
WHERE n.nspname='public' AND r.rolcanlogin AND r.rolname NOT LIKE 'pg_%'
ORDER BY r.rolname;
COMMIT;
SQL
echo 'Diagnostica completata. Nessuna modifica a database o servizi.'
