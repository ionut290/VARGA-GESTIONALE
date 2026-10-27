#!/usr/bin/env bash
# Safe read-only server inventory. No restarts, changes, or secrets.
set -euo pipefail
echo 'Varga Gestionale / Oracle: read-only preflight'
date -Is
uname -a
free -h
df -h /
if command -v docker >/dev/null; then
  docker --version
  docker compose version || true
  docker ps --format 'table {{.Names}}\t{{.Status}}' || true
fi
ss -tln | grep -E '(:18098|:5432|:80|:443)' || true
echo 'No services changed. Configure private .env, backup and HTTPS before deployment.'
