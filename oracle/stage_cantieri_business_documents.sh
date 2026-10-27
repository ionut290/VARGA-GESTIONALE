#!/usr/bin/env bash
# Import protected operational Cantieri document copies into isolated Gestionale stage.
# Does not write Cantieri and does not touch workspace sections.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp /tmp/vg-cantieri-stage.XXXXXXXX)"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
echo "Esporto dati operativi Cantieri dalle fotografie Oracle (nessuna modifica alla sorgente)..."
sudo docker exec -i db-postgres-1 psql -X -q -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "
COPY (
 WITH merged AS (
 SELECT path,collection_name,data,update_time,'20260819' AS snapshot,1 AS priority
 FROM public.firestore_import_test_20260819
 UNION ALL
 SELECT path,collection_name,data,update_time,'20261026' AS snapshot,2 AS priority
 FROM public.firestore_import_test_20261026
 ), chosen AS (
 SELECT DISTINCT ON (path) path,collection_name,data,update_time,snapshot
 FROM merged WHERE collection_name IN (
 'impianti','impiantiFisici','commesse','globalCommesse','personale',
 'oreReports','lavorazioni','prezziario','mezzi','squadreStorico',
 'squadreCommesse','operatorCommessaHistory','commessaResources',
 'contabilita','noteCommessa','ferieColleghi','calendarEvents',
 'verdeLevatoRecords','verdeLevatoCommesse')
 ORDER BY path,priority DESC
 )
 SELECT path,collection_name,data::text,COALESCE(update_time,''),snapshot
 FROM chosen ORDER BY path
) TO STDOUT WITH (FORMAT csv)" > "$tmp"
if [ ! -s "$tmp" ]; then echo "STOP: esportazione vuota"; exit 2; fi
echo "Carico in tabella isolata: vg.cantieri_source_stage (nessun cambiamento ai workspace)..."
sudo docker compose -p vg-gestionale-oracle exec -T db psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale <<'SQL'
CREATE TABLE IF NOT EXISTS vg.cantieri_source_stage (
 path text PRIMARY KEY,
 collection_name text NOT NULL,
 data jsonb NOT NULL,
 update_time text,
 source_snapshot text NOT NULL,
 staged_at timestamptz NOT NULL DEFAULT now()
);
SQL
# Transactional bulk ingest into a temporary table, then upsert; interrupted uploads roll back.
{ printf '%s\n' 'BEGIN;' 'CREATE TEMP TABLE cantieri_incoming (path text, collection_name text, data jsonb, update_time text, source_snapshot text) ON COMMIT DROP;' 'COPY cantieri_incoming (path,collection_name,data,update_time,source_snapshot) FROM STDIN WITH (FORMAT csv);'; cat "$tmp"; printf '\\.\n'; cat <<'SQL'
INSERT INTO vg.cantieri_source_stage(path,collection_name,data,update_time,source_snapshot)
SELECT path,collection_name,data,update_time,source_snapshot FROM cantieri_incoming
ON CONFLICT (path) DO UPDATE
SET collection_name=EXCLUDED.collection_name,data=EXCLUDED.data,
update_time=EXCLUDED.update_time,source_snapshot=EXCLUDED.source_snapshot,staged_at=now()
WHERE (vg.cantieri_source_stage.collection_name,vg.cantieri_source_stage.data,
vg.cantieri_source_stage.update_time,vg.cantieri_source_stage.source_snapshot)
IS DISTINCT FROM
(EXCLUDED.collection_name,EXCLUDED.data,EXCLUDED.update_time,EXCLUDED.source_snapshot);
COMMIT;
SELECT source_snapshot,collection_name,COUNT(*) AS documenti
FROM vg.cantieri_source_stage GROUP BY source_snapshot,collection_name ORDER BY collection_name,source_snapshot;
SQL
} | sudo docker compose -p vg-gestionale-oracle exec -T db psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale
echo "STAGING COMPLETATO. Le sezioni del Gestionale non sono state modificate. Sync automatica non ancora attiva."
