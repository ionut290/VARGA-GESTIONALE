#!/usr/bin/env bash
# Read-only audit of active pilot API configuration and actual application routes.
set -euo pipefail
name=varga-secure-pilot-varga-pilot-api-1
echo '=== PILOT API ==='
sudo docker inspect "$name" --format 'Status={{.State.Status}} Image={{.Config.Image}} Workdir={{.Config.WorkingDir}} Project={{index .Config.Labels "com.docker.compose.project"}} Config={{index .Config.Labels "com.docker.compose.project.config_files"}}'
echo '=== ENVIRONMENT KEY NAMES ONLY ==='
sudo docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1 | grep -Ei 'AUTH|DATABASE|FIREBASE|SYNC|ORACLE|POSTGRES' | sort || true
echo '=== APPLICATION ENTRY / MOUNTS ==='
sudo docker inspect "$name" --format 'Entrypoint={{json .Config.Entrypoint}} Cmd={{json .Config.Cmd}}'
sudo docker inspect "$name" --format '{{range .Mounts}}{{println .Type .Destination}}{{end}}'
echo '=== HEALTH STATE ==='
sudo docker inspect "$name" --format 'Health={{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}} Restarts={{.RestartCount}}'
echo 'No configuration or data changed.'
