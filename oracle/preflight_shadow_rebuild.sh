#!/usr/bin/env bash
# Safe preflight for the existing Firebase-to-Oracle shadow service.
# Does not rebuild, start, restart or change data.
set -euo pipefail
cd /home/ubuntu/varga-gestionale-oracle
name=varga-gestionale-oracle-varga-gestionale-shadow-1
echo '=== SERVIZIO / FILE COMPOSE ==='
sudo docker inspect "$name" --format 'Status={{.State.Status}} Restarts={{.RestartCount}} Service={{index .Config.Labels "com.docker.compose.service"}}'
echo '=== CONTROLLO SINTASSI SORGENTE ==='
node --check oracle-shadow/sync.js 2>/dev/null || sudo docker run --rm --network none -v "$PWD/oracle-shadow/sync.js:/tmp/sync.js:ro" --entrypoint node node:22-alpine --check /tmp/sync.js
echo '=== SERVIZIO COMPOSE ==='
sudo docker compose -f compose.oracle.yml config --services
echo '=== FILE BUILD SHADOW ==='
grep -n -A 16 -B 3 'varga-gestionale-shadow:' compose.oracle.yml | sed -E '/(PASSWORD|TOKEN|SECRET|KEY|DATABASE_URL)/Id'
echo 'Preflight complete. No containers changed.'
