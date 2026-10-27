#!/usr/bin/env bash
# Read-only collection-by-collection reconciliation. No import or mutation.
set -euo pipefail
cd "$(dirname "$0")/.."
tmpdir="$(mktemp -d /tmp/vg-reconcile.XXXXXXXX)"
chmod 700 "$tmpdir"
trap 'rm -rf "$tmpdir"' EXIT
echo "Esporto soltanto identificativi e raccolte: nessun payload e nessuna modifica."
sudo docker exec -i db-postgres-1 psql -X -q -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "
COPY (SELECT source_path,split_part(source_path,'/',1),source FROM public.varga_sync_state ORDER BY source_path)
TO STDOUT WITH (FORMAT csv)" > "$tmpdir/sync.csv"
sudo docker compose -f oracle/compose.yaml -p vg-gestionale-oracle exec -T db psql -X -q -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -c "
COPY (SELECT path,collection_name FROM vg.cantieri_source_stage ORDER BY path)
TO STDOUT WITH (FORMAT csv)" > "$tmpdir/stage.csv"
python3 - "$tmpdir/sync.csv" "$tmpdir/stage.csv" <<'PY'
import csv,sys
from collections import Counter
with open(sys.argv[1],newline='') as f:
    source={path:(collection,origin) for path,collection,origin in csv.reader(f)}
with open(sys.argv[2],newline='') as f:
    stage={path:collection for path,collection in csv.reader(f)}
source_keys={k for k,v in source.items() if v[1]=='firebase'}
stage_keys=set(stage)
both=source_keys & stage_keys
only_source=source_keys-stage_keys
only_stage=stage_keys-source_keys
print("FONTE SINCRONIZZAZIONE FIREBASE:",len(source_keys))
print("STAGING GESTIONALE:",len(stage_keys))
print("CORRISPONDENZE PER PERCORSO:",len(both))
print("SOLO NELLA FONTE:",len(only_source))
print("SOLO NELLO STAGING:",len(only_stage))
print("ATTENZIONE: gli archivi storici possono contenere documenti non presenti nella fonte attuale; non sono eliminazioni.")
groups=sorted(set(v[0] for k,v in source.items() if k in source_keys)|set(stage.values()))
print("\nRaccolta | Sorgente | Staging | In comune | Solo fonte | Solo staging")
for group in groups:
    a=sum(source[k][0]==group for k in source_keys)
    b=sum(stage[k]==group for k in stage_keys)
    c=sum(source[k][0]==group and stage[k]==group for k in both)
    x=sum(source[k][0]==group for k in only_source)
    y=sum(stage[k]==group for k in only_stage)
    print(f"{group} | {a} | {b} | {c} | {x} | {y}")
if len(source_keys)==0 or len(stage_keys)==0:
    print("STOP: fonte o staging vuoti; nessuna azione consentita.")
print("\nSOLA LETTURA. Nessun documento è stato copiato, sovrascritto o cancellato.")
PY
