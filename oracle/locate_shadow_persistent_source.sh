#!/usr/bin/env bash
# Read-only discovery of shadow container deployment and startup SQL.
set -euo pipefail
name=varga-gestionale-oracle-varga-gestionale-shadow-1
echo '=== COMPOSE PROVENANCE ==='
sudo docker inspect "$name" --format 'Project={{index .Config.Labels "com.docker.compose.project"}} Service={{index .Config.Labels "com.docker.compose.service"}} Workdir={{index .Config.Labels "com.docker.compose.project.working_dir"}} Config={{index .Config.Labels "com.docker.compose.project.config_files"}}'
echo '=== MOUNTS ==='
sudo docker inspect "$name" --format '{{range .Mounts}}{{println .Type .Destination}}{{end}}'
echo '=== STARTUP IMPLEMENTATION (first 95 lines, sanitized) ==='
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sudo docker cp "$name:/app/sync.js" "$tmp" >/dev/null
python3 - "$tmp" <<'PY'
import pathlib,sys,re
for i,line in enumerate(pathlib.Path(sys.argv[1]).read_text().splitlines()[:95],1):
 if re.search(r'password|secret|token|private.key|credential|api.key',line,re.I):
  line='[redacted]'
 print(str(i)+': '+line[:220])
PY
echo 'Read-only audit complete.'
