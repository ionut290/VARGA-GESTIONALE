#!/usr/bin/env bash
set -euo pipefail
name=varga-gestionale-oracle-varga-gestionale-shadow-1
echo '=== RUOLO DELLA CONNESSIONE SHADOW (nessuna password mostrata) ==='
sudo docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | python3 -c 'import sys,urllib.parse
for line in sys.stdin:
 if line.startswith("DATABASE_URL="):
  u=urllib.parse.urlsplit(line.strip().split("=",1)[1])
  print("db_user="+(u.username or "<assente>"))
  print("db_name="+(u.path.lstrip("/") or "<assente>"))
  print("db_host="+(u.hostname or "<assente>"))'
echo '=== TABELL A ESISTENTE: DIRITTI POSTGRESQL ==='
sudo docker exec db-postgres-1 psql -X -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -P pager=off -c "SELECT rolname,has_schema_privilege(rolname,'public','USAGE') AS can_use_schema,has_schema_privilege(rolname,'public','CREATE') AS can_create_in_schema,has_table_privilege(rolname,'public.varga_gestionale_shadow','INSERT,UPDATE') AS can_write_shadow FROM pg_roles WHERE rolname IN ('varga','varga_reader') ORDER BY rolname"
echo 'Nessun dato o permesso modificato.'
