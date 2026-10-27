#!/usr/bin/env bash
# Immutable new staging snapshot using already uploaded authenticated export.
set -euo pipefail
cd "$(dirname "$0")"
umask 077
base=/home/ubuntu/gestionale-private
old="$base/Varga-Gestionale-reconciled-2026-10-27.json"
latest="$base/Varga-Gestionale-live-latest.json"
earliest="$base/Varga-Gestionale-backup.json"
output="$base/Varga-Gestionale-reconciled-refresh-2026-10-27.json"
workspace=gestionale_backup_20261027_refresh
for p in "$old" "$latest" "$earliest"; do
 if [[ ! -f "$p" || -L "$p" ]]; then echo "STOP: fonte privata assente/non valida"; exit 2; fi
done
echo "=== PREPARAZIONE NUOVA FOTOGRAFIA (PRIMA SOLO ANALISI) ==="
python3 prepare_reconciled_stage.py "$old" "$latest" "$output" --earliest "$earliest" --dry-run
if [[ -e "$output" || -L "$output" ]]; then
 python3 prepare_reconciled_stage.py "$old" "$latest" "$output" --earliest "$earliest" --verify-existing
else
 python3 prepare_reconciled_stage.py "$old" "$latest" "$output" --earliest "$earliest"
fi
echo "=== CONTROLLO WORKSPACE SEPARATO ==="
existing="$(docker compose -p vg-gestionale-oracle exec -T db psql -X -v ON_ERROR_STOP=1 -U varga_gestionale -d varga_gestionale -Atqc "SELECT count(*) FROM vg.workspace_sections WHERE workspace_id='$workspace'")"
if [[ "$existing" != 0 ]]; then
 echo "STOP: fotografia refresh già presente; nessuna sovrascrittura";exit 2
fi
checksum="$(sha256sum "$output" | cut -d' ' -f1)"
echo "=== DRY RUN IMPORTATORE ==="
docker compose -p vg-gestionale-oracle exec -T api python -m backend.admin import-snapshot --workspace "$workspace" --file - --dry-run < "$output"
echo "=== IMPORTA SOLO NUOVO WORKSPACE IN TRANSAZIONE ==="
docker compose -p vg-gestionale-oracle exec -T api python -m backend.admin import-snapshot --workspace "$workspace" --file - --confirm-sha256 "$checksum" < "$output"
echo "=== CONFRONTO ESATTO, SENZA STAMPARE CONTENUTI ==="
python3 - "$output" "$workspace" <<'PY'
import json,subprocess,sys
source,ws=sys.argv[1:]
obj=json.load(open(source,encoding="utf-8"))
sql="SELECT jsonb_build_object('section',section,'data',data)::text FROM vg.workspace_sections WHERE workspace_id='"+ws+"' ORDER BY section"
cmd=["docker","compose","-p","vg-gestionale-oracle","exec","-T","db","psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","varga_gestionale","-d","varga_gestionale","-c",sql]
p=subprocess.run(cmd,capture_output=True,text=True,check=True)
got={}
for line in p.stdout.splitlines():
 item=json.loads(line);got[item["section"]]=item["data"]
if got!=obj["data"]:raise SystemExit("ERRORE: archivio refresh non identico; non utilizzare")
print("OK: nuova fotografia identica, sezioni:",len(got))
PY
echo "SUCCESSO: nuova fotografia privata e separata. Originale, Firebase e radio invariati."
