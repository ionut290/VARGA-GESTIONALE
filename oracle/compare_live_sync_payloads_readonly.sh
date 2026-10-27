#!/usr/bin/env bash
# Compare live sync JSON payloads with historical staging without transferring payloads to disk.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d /tmp/vg-payload-compare.XXXXXXXX)"
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT
sudo docker exec -i db-postgres-1 psql -X -q -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "
COPY (SELECT source_path,md5(payload::text) FROM public.varga_sync_state WHERE source='firebase' ORDER BY source_path)
TO STDOUT WITH (FORMAT csv)" > "$tmp/source.csv"
sudo docker compose -f oracle/compose.yaml -p vg-gestionale-oracle exec -T db psql -X -q -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -c "
COPY (SELECT path,md5(data::text),collection_name FROM vg.cantieri_source_stage ORDER BY path)
TO STDOUT WITH (FORMAT csv)" > "$tmp/stage.csv"
python3 - "$tmp/source.csv" "$tmp/stage.csv" <<'PY'
import csv,sys,collections
with open(sys.argv[1],newline='') as f: src={p:h for p,h in csv.reader(f)}
with open(sys.argv[2],newline='') as f: stage={p:(h,c) for p,h,c in csv.reader(f)}
shared=src.keys() & stage.keys()
counts=collections.defaultdict(lambda:[0,0,0,0])
for path in shared:
 c=stage[path][1]
 counts[c][0]+=1
 counts[c][1 if src[path]==stage[path][0] else 2]+=1
for path in src.keys()-stage.keys():counts[path.split('/')[0]][3]+=1
print('Raccolta | In comune | JSON identico | JSON diverso | Solo sorgente')
for c,n in sorted(counts.items()):
 print(f'{c} | {n[0]} | {n[1]} | {n[2]} | {n[3]}')
print('TOTALI', 'comuni',len(shared),'identici',sum(src[k]==stage[k][0] for k in shared),'diversi',sum(src[k]!=stage[k][0] for k in shared),'solo_sorgente',len(src.keys()-stage.keys()))
print('NOTA: il confronto usa il JSON normalizzato da PostgreSQL; formati diversi tra le due sorgenti possono produrre differenze strutturali.')
print('SOLO LETTURA: nessun aggiornamento effettuato.')
PY
