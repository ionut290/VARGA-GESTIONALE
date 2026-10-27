#!/usr/bin/env bash
# Single safe freshness audit. Never imports, overwrites or publishes.
set -euo pipefail
umask 077
cd "$(dirname "$0")"
base=/home/ubuntu/gestionale-private
historical="$base/Varga-Gestionale-reconciled-2026-10-27.json"
live="$base/Varga-Gestionale-live-latest.json"
if [[ ! -f "$historical" || -L "$historical" ]]; then
  echo "STOP: snapshot storico privato assente"; exit 2
fi
if [[ ! -f "$live" || -L "$live" ]]; then
  echo "STOP: manca una nuova esportazione Firebase autenticata." 
  echo "Necessario: Varga-Gestionale-live-latest.json nella cartella privata del server."
  echo "Non riutilizzare l'export 2026-10-27 come prova di aggiornamento."
  exit 3
fi
python3 - "$historical" "$live" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import json,sys
historical,live=(Path(p) for p in sys.argv[1:])
def load(p):
 if p.stat().st_size>150_000_000:raise ValueError("Dimensione eccessiva")
 obj=json.loads(p.read_text())
 if obj.get("app")!="Varga Gestionale" or not isinstance(obj.get("data"),dict):
  raise ValueError("Formato dati errato")
 return obj
try:
 a,b=load(historical),load(live)
 dt=str(b.get("exported_at") or b.get("createdAt") or "")
 date=datetime.fromisoformat(dt.replace("Z","+00:00"))
 if date.tzinfo is None or date.astimezone(timezone.utc)>datetime.now(timezone.utc):
  raise ValueError("Export senza orario verificabile")
 if b.get("workspace") not in (None,"varga-azienda"):
  raise ValueError("Workspace differente")
 oldstamp=str(a.get("createdAt") or a.get("exported_at") or "")
 if not oldstamp:raise ValueError("Data snapshot storico assente")
 oldtime=datetime.fromisoformat(oldstamp.replace("Z","+00:00"))
 if oldtime.tzinfo is None:
  # A date-only baseline has no reliable time. Require a later calendar day.
  if date.date()<=oldtime.date():
   raise ValueError("Export non successivo al giorno dello snapshot")
 elif date<=oldtime:
  raise ValueError("Export non più recente della copia importata")
 previous=a["data"];current=b["data"]
 changed=[k for k in set(previous)|set(current) if previous.get(k)!=current.get(k)]
 print("VERIFICA DI FRESCHEZZA SUPERATA")
 print("Sezioni precedente:",len(previous),"nuovo export:",len(current))
 print("Sezioni con differenze:",len(changed))
 print("Il nuovo export NON è stato importato né pubblicato.")
except (ValueError,OSError,TypeError,KeyError) as exc:
 print("STOP: non è possibile dimostrare che la nuova esportazione sia valida:",type(exc).__name__)
 sys.exit(2)
PY
