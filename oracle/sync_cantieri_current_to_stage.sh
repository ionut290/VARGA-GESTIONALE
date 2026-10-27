#!/usr/bin/env bash
# Incrementally refresh isolated Oracle Cantieri staging from current sync state.
# Source is read-only. Destination update is additive/upsert-only; absent paths
# are never deleted, and Gestionale workspace sections are not modified.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d /tmp/vg-cantieri-current.XXXXXXXX)"
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT

source_db=db-postgres-1
target_project=vg-gestionale-oracle
echo "=== PREFLIGHT (solo lettura) ==="
if ! sudo docker inspect "$source_db" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
  echo "STOP: database Cantieri non disponibile"; exit 2
fi
if ! sudo docker compose -f oracle/compose.yaml -p "$target_project" ps --status running --services | grep -qx db; then
  echo "STOP: database Gestionale non disponibile"; exit 2
fi
sudo docker exec "$source_db" psql -X -q -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c \
  "SELECT 1 FROM public.varga_sync_state WHERE source='firebase' LIMIT 1" >/dev/null
sudo docker compose -f oracle/compose.yaml -p "$target_project" exec -T db psql -X -q -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -c \
  "SELECT 1 FROM information_schema.tables WHERE table_schema='vg' AND table_name='cantieri_source_stage'" | grep -qx 1

echo "=== ESPORTAZIONE CORRENTE (payload in area temporanea privata) ==="
sudo docker exec -i "$source_db" psql -X -q -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "
COPY (
 SELECT source_path,split_part(source_path,'/',1),payload::text,COALESCE(updated_at::text,'')
 FROM public.varga_sync_state
 WHERE source='firebase' AND pending=FALSE
 ORDER BY source_path
) TO STDOUT WITH (FORMAT csv)" > "$tmp/current.csv"
chmod 600 "$tmp/current.csv"
if [ ! -s "$tmp/current.csv" ]; then
  echo "STOP: esportazione corrente vuota; staging invariato"; exit 2
fi
python3 - "$tmp/current.csv" <<'PY'
import csv,sys
csv.field_size_limit(64*1024*1024)
with open(sys.argv[1],newline='') as f:
    rows=list(csv.reader(f))
if not rows or any(len(row)!=4 or not row[0] or not row[1] for row in rows):
    raise SystemExit("STOP: righe esportate non valide")
if len({row[0] for row in rows}) != len(rows):
    raise SystemExit("STOP: percorsi duplicati nella sorgente")
print("Record correnti validati:",len(rows))
PY

echo "=== UPSERT TRANSAZIONALE DEL SOLO STAGING ==="
{
  printf '%s\n' 'BEGIN;' \
    'CREATE TEMP TABLE cantieri_current_incoming(path text,collection_name text,data jsonb,update_time text) ON COMMIT DROP;' \
    'COPY cantieri_current_incoming(path,collection_name,data,update_time) FROM STDIN WITH (FORMAT csv);'
  cat "$tmp/current.csv"
  printf '\\\\.\\n'
  cat <<'SQL'
INSERT INTO vg.cantieri_source_stage(path,collection_name,data,update_time,source_snapshot)
SELECT path,collection_name,data,update_time,'current_sync'
FROM cantieri_current_incoming
ON CONFLICT(path) DO UPDATE SET
 collection_name=EXCLUDED.collection_name,
 data=EXCLUDED.data,
 update_time=EXCLUDED.update_time,
 source_snapshot='current_sync',
 staged_at=now()
WHERE (vg.cantieri_source_stage.collection_name,vg.cantieri_source_stage.data,
       vg.cantieri_source_stage.update_time,vg.cantieri_source_stage.source_snapshot)
 IS DISTINCT FROM (EXCLUDED.collection_name,EXCLUDED.data,
                   EXCLUDED.update_time,'current_sync');
COMMIT;
SELECT 'staging_totale' AS controllo,COUNT(*) FROM vg.cantieri_source_stage;
SELECT source_snapshot,collection_name,COUNT(*) AS documenti
FROM vg.cantieri_source_stage
GROUP BY source_snapshot,collection_name
ORDER BY source_snapshot,collection_name;
SQL
} | sudo docker compose -f oracle/compose.yaml -p "$target_project" exec -T db \
  psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale

echo "SYNC STAGING COMPLETATA. I record storici assenti dalla sorgente sono conservati."
echo "Workspace Gestionale e sezioni vc* non modificati; nessuna cancellazione effettuata."
