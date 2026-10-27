#!/usr/bin/env bash
# Safe read-only API diagnostics after isolated deployment.
set -u
cd "$(dirname "$0")/.."
echo "=== STATO CONTAINER (SOLA LETTURA) ==="
sudo docker inspect vg-gestionale-oracle-api-1 --format 'Stato={{.State.Status}} Riavvii={{.RestartCount}} Exit={{.State.ExitCode}}' 2>&1 || true
echo "=== HEALTH DIRETTO API ==="
sudo docker compose -f oracle/compose.yaml -p vg-gestionale-oracle exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8098/api/gestionale/v1/health',timeout=5).read().decode())" 2>&1 || true
echo "=== HEALTH HTTPS ==="
curl -sS -m 10 -o /dev/null -w 'HTTP %{http_code}\n' https://gestionale.radio-romanii-italia.duckdns.org/api/gestionale/v1/health || true
echo "=== LOG RECENTI DELLA SOLA API GESTIONALE ==="
sudo docker logs --tail 70 vg-gestionale-oracle-api-1 2>&1 | sed -E 's/(postgresql:\/\/)[^@[:space:]]+@/\1***@/g' || true
