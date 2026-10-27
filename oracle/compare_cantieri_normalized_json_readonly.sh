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
# PostgreSQL exports can contain JSON fields larger than Python's 128 KiB CSV default.
csv.field_size_limit(64 * 1024 * 1024)
wrapped_values=collections.Counter()
tagged_envelopes=collections.Counter()

def decode(x, origin):
    """Decode only unambiguous Firestore/legacy value envelopes.

    Historical snapshots may use the Firestore REST typed-value format while
    the live shadow keeps ordinary JSON. This function deliberately leaves
    unfamiliar objects intact: an unknown shape must count as different, not
    be guessed into equality.
    """
    if isinstance(x,list):
        return [decode(v,origin) for v in x]
    if not isinstance(x,dict):
        return x
    if set(x)=={'v'}:
        wrapped_values[(origin,'legacy_v')]+=1
        return decode(x['v'],origin)
    if set(x)=={'stringValue'}:
        wrapped_values[(origin,'stringValue')]+=1
        return x['stringValue']
    if set(x)=={'booleanValue'}:
        wrapped_values[(origin,'booleanValue')]+=1
        return x['booleanValue']
    if set(x)=={'nullValue'}:
        wrapped_values[(origin,'nullValue')]+=1
        return None
    if set(x)=={'integerValue'}:
        wrapped_values[(origin,'integerValue')]+=1
        try: return int(x['integerValue'])
        except (TypeError,ValueError): return x
    if set(x)=={'doubleValue'}:
        wrapped_values[(origin,'doubleValue')]+=1
        try:
            value=float(x['doubleValue'])
            return x if not math.isfinite(value) else value
        except (TypeError,ValueError): return x
    for name in ('timestampValue','referenceValue','bytesValue'):
        if set(x)=={name}:
            wrapped_values[(origin,name)]+=1
            return x[name]
    if set(x)=={'geoPointValue'} and isinstance(x['geoPointValue'],dict):
        point=x['geoPointValue']
        if set(point) <= {'latitude','longitude'}:
            wrapped_values[(origin,'geoPointValue')]+=1
            return {'latitude':decode(point.get('latitude'),origin),
                    'longitude':decode(point.get('longitude'),origin)}
    if set(x)=={'arrayValue'} and isinstance(x['arrayValue'],dict):
        inner=x['arrayValue']
        if set(inner) <= {'values'}:
            wrapped_values[(origin,'arrayValue')]+=1
            return [decode(v,origin) for v in inner.get('values',[])]
    if set(x)=={'mapValue'} and isinstance(x['mapValue'],dict):
        inner=x['mapValue']
        if set(inner) <= {'fields'} and isinstance(inner.get('fields',{}),dict):
            wrapped_values[(origin,'mapValue')]+=1
            return {k:decode(v,origin) for k,v in inner.get('fields',{}).items()}
    return {k:decode(v,origin) for k,v in x.items()}

def decode_tagged_probe(x, origin):
    """Diagnostic only: remove exact {t,v} envelopes without trusting them.

    The result is never used to authorise an import. It lets the report show
    whether a legacy serialiser, rather than business data, explains a whole
    class of mismatches.
    """
    if isinstance(x,list):
        return [decode_tagged_probe(v,origin) for v in x]
    if not isinstance(x,dict):
        return x
    if set(x)=={'t','v'}:
        tagged_envelopes[(origin,type(x['t']).__name__)]+=1
        return decode_tagged_probe(x['v'],origin)
    return {k:decode_tagged_probe(v,origin) for k,v in x.items()}
def load(path):
    with open(path,newline='') as f:
        return {key:json.loads(payload) for key,payload in csv.reader(f)}
live=load(sys.argv[1]);stage=load(sys.argv[2])
matched=live.keys() & stage.keys()
stats=collections.defaultdict(lambda:[0,0,0])
different_fields=collections.Counter()
probe_matches=0
for key in matched:
    wrapped=stage[key]
    previous=decode(wrapped,'storico')
    current=decode(live[key],'sorgente')
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
    if decode_tagged_probe(wrapped,'storico')==decode_tagged_probe(live[key],'sorgente'):
        probe_matches+=1
print('Raccolta | Comuni | Uguali normalizzati | Differenti normalizzati')
for group,nums in sorted(stats.items()):
    print(f'{group} | {nums[0]} | {nums[1]} | {nums[2]}')
print('TOTALE',len(matched),'uguali',sum(v[1] for v in stats.values()),'differenti',sum(v[2] for v in stats.values()))
print('SOLO SORGENTE',len(live.keys()-stage.keys()),'SOLO STORICO',len(stage.keys()-live.keys()))
print('SONDA {t,v} (diagnostica, non autorizza import):',probe_matches,'equivalenti su',len(matched))
if tagged_envelopes:
    print('Involucri {t,v} rilevati (solo tipo del tag e conteggio):')
    for (origin,kind),count in sorted(tagged_envelopes.items()):
        print(origin,kind,count,sep=' | ')
print('Campi con differenze frequenti (nomi, non valori):')
for (group,field),count in different_fields.most_common(25):
    print(group,field,count,sep=' | ')
if wrapped_values:
    print('Involucri decodificati (solo tipo e conteggio):')
    for (origin,kind),count in sorted(wrapped_values.items()):
        print(origin,kind,count,sep=' | ')
else:
    print('Nessun involucro JSON noto rilevato: le differenze non sono dovute a {v:...} o ai tipi Firestore standard.')
print('Nota: gli involucri non riconosciuti restano intenzionalmente diversi e richiedono revisione, non conversioni automatiche.')
print('SOLO LETTURA. Nessuna acquisizione o sovrascrittura effettuata.')
PY
