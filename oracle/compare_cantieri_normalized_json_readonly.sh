#!/usr/bin/env bash
# Read-only semantic comparison of Cantieri source with wrapped historical JSON.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d /tmp/vg-normalized.XXXXXXXX)"
chmod 700 "$tmp"
trap 'rm -rf "$tmp"' EXIT
echo "Esporto JSON nel deposito temporaneo protetto; non mostro contenuti."
sudo docker exec -i db-postgres-1 psql -X -q -v ON_ERROR_STOP=1 -U varga -d varga_cantieri -c "COPY (SELECT source_path,payload::text FROM public.varga_sync_state WHERE source='firebase' ORDER BY source_path) TO STDOUT WITH (FORMAT csv)" > "$tmp/live.csv"
sudo docker compose -f oracle/compose.yaml -p vg-gestionale-oracle exec -T db psql -X -q -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -c "COPY (SELECT path,data::text FROM vg.cantieri_source_stage ORDER BY path) TO STDOUT WITH (FORMAT csv)" > "$tmp/stage.csv"
python3 - "$tmp/live.csv" "$tmp/stage.csv" <<'PY'
import csv,sys,json,collections
# PostgreSQL exports can contain JSON fields larger than Python's 128 KiB CSV default.
csv.field_size_limit(64 * 1024 * 1024)
def decode(x):
    if isinstance(x,dict):
        if set(x)=={'v'}: return decode(x['v'])
        return {k:decode(v) for k,v in x.items()}
    if isinstance(x,list): return [decode(v) for v in x]
    return x
def load(path):
    with open(path,newline='') as f:
        return {key:json.loads(payload) for key,payload in csv.reader(f)}
live=load(sys.argv[1]);stage=load(sys.argv[2])
matched=live.keys() & stage.keys()
stats=collections.defaultdict(lambda:[0,0,0])
different_fields=collections.Counter()
for key in matched:
    wrapped=stage[key]
    previous=decode(wrapped.get('v',wrapped))
    current=live[key]
    group=key.split('/')[0]
    stats[group][0]+=1
    if previous==current:
        stats[group][1]+=1
    else:
        stats[group][2]+=1
        if isinstance(previous,dict) and isinstance(current,dict):
            for field in previous.keys()|current.keys():
                if previous.get(field)!=current.get(field):
                    different_fields[(group,field)]+=1
print('Raccolta | Comuni | Uguali normalizzati | Differenti normalizzati')
for group,nums in sorted(stats.items()):
    print(f'{group} | {nums[0]} | {nums[1]} | {nums[2]}')
print('TOTALE',len(matched),'uguali',sum(v[1] for v in stats.values()),'differenti',sum(v[2] for v in stats.values()))
print('SOLO SORGENTE',len(live.keys()-stage.keys()),'SOLO STORICO',len(stage.keys()-live.keys()))
print('Campi con differenze frequenti (nomi, non valori):')
for (group,field),count in different_fields.most_common(25):
    print(group,field,count,sep=' | ')
print('Nota: un contenitore {v:...} viene decodificato; altri metadati possono richiedere regole specifiche.')
print('SOLO LETTURA. Nessuna acquisizione o sovrascrittura effettuata.')
PY
