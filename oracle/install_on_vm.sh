#!/usr/bin/env bash
# Safe one-shot install on YOUR Oracle VM; isolated from Varga Cantieri/AzuraCast.
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
umask 077

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Docker e Docker Compose sono necessari. Nessun servizio cambiato." >&2
  exit 1
fi
if [ -f ".env" ]; then
  echo "Configurazione .env già presente: non viene modificata."
else
  echo "Genero credenziali PostgreSQL private, non stampate e non caricate su GitHub."
  python3 - <<'PY'
import os,secrets
from pathlib import Path
from urllib.parse import quote
p=Path(".env")
pwd=secrets.token_urlsafe(44)
url="postgresql://varga_gestionale:"+quote(pwd,safe="")+"@db:5432/varga_gestionale"
origins="https://gestionale.radio-romanii-italia.duckdns.org,https://ionut290.github.io"
data=f"VG_DB_PASSWORD={pwd}\nVG_DATABASE_URL={url}\nVG_ALLOWED_ORIGINS={origins}\nVG_SESSION_HOURS=12\n"
fd=os.open(str(p),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,"w",encoding="utf-8") as f:f.write(data)
print("Creato .env con permessi 0600.")
PY
fi
chmod 600 .env
if ss -ltn 2>/dev/null | grep -qE '[:.]18098[[:space:]]'; then
  echo "Porta locale 18098 già in ascolto: controllare prima di procedere. Nessun container avviato." >&2
  exit 1
fi
if [ "$(df -Pk . | awk 'END {print $4}')" -lt 2097152 ]; then
  echo "Meno di 2 GiB liberi: interrompo per non compromettere gli altri servizi." >&2
  exit 1
fi
if [ "$(free -m | awk '/Mem:/ {print $7}')" -lt 1300 ]; then
  echo "Memoria disponibile inferiore a 1300 MiB: interrompo per proteggere radio e Cantieri." >&2
  exit 1
fi
echo "Avvio SOLO lo stack isolato Varga Gestionale Oracle; nessun comando su AzuraCast o Cantieri."
docker compose -p vg-gestionale-oracle up -d --build
healthy=false
for i in {1..18}; do
  if curl --silent --fail --max-time 3 'http://127.0.0.1:18098/api/gestionale/v1/health' | grep -q '"ready":true'; then
    healthy=true
    break
  fi
  sleep 2
done
if [ "$healthy" != true ]; then
  echo "L'API Oracle non risponde ancora: verificare con docker compose -p vg-gestionale-oracle logs --tail 100." >&2
  exit 1
fi
echo "API Oracle raggiungibile SOLO via loopback 127.0.0.1:18098. HTTPS pubblico e dati non ancora migrati."
echo "Prossimi controlli: export privato Firebase, import verificato, collegamento HTTPS, test frontend."
