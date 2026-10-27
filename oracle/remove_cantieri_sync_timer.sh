#!/usr/bin/env bash
# Stop and remove only the dedicated Cantieri sync timer/service.
set -euo pipefail
systemctl disable --now varga-cantieri-sync.timer 2>/dev/null || true
systemctl stop varga-cantieri-sync.service 2>/dev/null || true
for file in /etc/systemd/system/varga-cantieri-sync.timer /etc/systemd/system/varga-cantieri-sync.service; do
  if [ -f "$file" ]; then
    mv "$file" "$file.disabled.$(date -u +%Y%m%dT%H%M%SZ)"
  fi
done
systemctl daemon-reload
echo "Timer fermato; unità conservate con estensione .disabled per ripristino."
