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
import csv,sys,json,collections,math

csv.field_size_limit(64 * 1024 * 1024)
tag_counts=collections.Counter()

def unwrap(x):
    if isinstance(x,list):
        return [unwrap(v) for v in x]
    if not isinstance(x,dict):
        return x
    if set(x)=={'t','v'} and isinstance(x['t'],str):
        tag=x['t']
        tag_counts[tag]+=1
        value=x['v']
        if tag=='map' and isinstance(value,dict):
            return {k:unwrap(v) for k,v in value.items()}
        if tag=='array' and isinstance(value,list):
            return [unwrap(v) for v in value]
        if tag=='null':
            return None
        if tag=='boolean' and isinstance(value,bool):
            return value
        if tag=='number' and isinstance(value,(int,float)) and not isinstance(value,bool):
            return value
        if tag in ('string','timestamp') and isinstance(value,str):
            return value
        # Preserve unknown or malformed tagged values for a visible mismatch.
        return {'t':tag,'v':unwrap(value)}
    return {k:unwrap(v) for k,v in x.items()}

def shape(x):
    if x is None: return 'null'
    if isinstance(x,bool): return 'boolean'
    if isinstance(x,(int,float)): return 'number'
    if isinstance(x,str):
        # Report only whether a value resembles an ISO timestamp; never print it.
        return 'iso_datetime_string' if 'T' in x and len(x)>=19 else 'string'
    if isinstance(x,list): return 'array'
    if isinstance(x,dict):
        keys=','.join(sorted(k for k in x if isinstance(k,str) and len(k)<=40)[:8])
        return 'object['+keys+']'
    return type(x).__name__

def load(path):
    with open(path,newline='') as f:
        return {key:json.loads(payload) for key,payload in csv.reader(f)}

live=load(sys.argv[1]);stage=load(sys.argv[2])
matched=live.keys() & stage.keys()
stats=collections.defaultdict(lambda:[0,0,0])
different_fields=collections.Counter()
field_shapes=collections.Counter()
for key in matched:
    previous=unwrap(stage[key])
    current=unwrap(live[key])
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
                    field_shapes[(group,field,shape(previous.get(field)),shape(current.get(field)))]+=1
print('Raccolta | Comuni | Uguali normalizzati | Differenti normalizzati')
for group,nums in sorted(stats.items()):
    print(f'{group} | {nums[0]} | {nums[1]} | {nums[2]}')
print('TOTALE',len(matched),'uguali',sum(v[1] for v in stats.values()),'differenti',sum(v[2] for v in stats.values()))
print('SOLO SORGENTE',len(live.keys()-stage.keys()),'SOLO STORICO',len(stage.keys()-live.keys()))
print('Tag legacy {t,v} decodificati (solo tag e conteggio):')
for tag,count in sorted(tag_counts.items()):
    print(tag,count,sep=' | ')
print('Campi con differenze frequenti (nomi, non valori):')
for (group,field),count in different_fields.most_common(25):
    print(group,field,count,sep=' | ')
print('Forme valori discordanti (solo schema, nessun valore):')
for (group,field,old_shape,new_shape),count in field_shapes.most_common(40):
    if different_fields[(group,field)] >= 10:
        print(group,field,old_shape,new_shape,count,sep=' | ')
print('CONFRONTO IN SOLA LETTURA. Nessuna acquisizione o sovrascrittura effettuata.')
PY
