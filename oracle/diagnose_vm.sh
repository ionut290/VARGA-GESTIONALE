#!/usr/bin/env bash
# Read-only Oracle / Gestionale diagnosis. Never prints Docker environment, mounts,
# database credentials, file contents, or complete application logs.
set -uo pipefail
export LC_ALL=C
echo "=== VARGA GESTIONALE / ORACLE DIAGNOSI SICURA ==="
date -u +'%Y-%m-%dT%H:%M:%SZ'
echo "=== CODICE IN USO ==="
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "branch=$(git branch --show-current 2>/dev/null || true)"
  echo "commit=$(git rev-parse --short HEAD 2>/dev/null || true)"
fi
echo "=== FILE DI CONFIGURAZIONE (SOLO PRESENZA) ==="
if [ -f .env ]; then echo "oracle_env=present"; else echo "oracle_env=absent"; fi
echo "=== PORTA LOCALE API 18098 ==="
if ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)18098$'; then
  echo "oracle_18098_listener=yes"
else
  echo "oracle_18098_listener=no"
fi
echo "=== SALUTE API DI PROVA ==="
if command -v curl >/dev/null; then
  curl -sS --max-time 5 -o /dev/null -w 'oracle_api_http=%{http_code}\n'     'http://127.0.0.1:18098/api/gestionale/v1/health' 2>/dev/null || echo "oracle_api_unreachable=yes"
fi
echo "=== CONTAINER (SOLO STATO, SENZA VARIABILI) ==="
if ! command -v docker >/dev/null; then
  echo "docker_missing=yes"; exit 0
fi
docker ps -a --format '{{.Names}}|{{.Status}}' 2>/dev/null |
  grep -E '^(varga-gestionale|vg-gestionale|varga-secure-pilot|azuracast|db-postgres)' ||
  echo "no_matching_containers"
echo "=== SHADOW IN RIAVVIO ==="
container='varga-gestionale-oracle-varga-gestionale-shadow-1'
if docker inspect "$container" >/dev/null 2>&1; then
  docker inspect --format 'shadow_status={{.State.Status}} shadow_exit={{.State.ExitCode}} shadow_restarts={{.RestartCount}} shadow_oom={{.State.OOMKilled}}' "$container" 2>/dev/null
  echo "=== CLASSIFICAZIONE ERRORI SHADOW (NON MOSTRA I LOG) ==="
  docker logs --tail 120 "$container" 2>&1 | python3 -c '
import re,sys,collections
text=sys.stdin.read()
patterns={
  "module_not_found":r"ModuleNotFoundError|Cannot find module|ImportError",
  "permission_denied":r"PermissionError|Permission denied",
  "file_missing":r"FileNotFoundError|No such file or directory",
  "database_connection":r"Connection refused|OperationalError|connection to server|could not connect|database is unavailable",
  "auth_failure":r"authentication failed|password authentication failed|invalid credentials",
  "port_conflict":r"address already in use|port is already allocated",
  "config_missing":r"Missing required|not set|unbound variable|KeyError|environment variable",
  "out_of_memory":r"out of memory|Cannot allocate memory|Killed process",
  "syntax_error":r"SyntaxError|IndentationError|unexpected token",
  "generic_exception":r"Traceback|Exception|ERROR|FATAL",
}
for k,p in patterns.items():
 n=len(re.findall(p,text,re.I))
 if n:print(k+"="+str(n))
if not any(re.search(p,text,re.I) for p in patterns.values()):
 print("no_known_error_signature=1 (logs not displayed for privacy)")
'
else
  echo "shadow_container_not_found=yes"
fi
echo "=== FINE DIAGNOSI. NESSUN SERVIZIO MODIFICATO ==="
