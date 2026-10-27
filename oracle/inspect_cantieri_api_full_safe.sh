#!/usr/bin/env bash
# Read-only inspection of small Cantieri API; redact credentials.
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/home/ubuntu/varga-cantieri/api/server.cjs')
for num,line in enumerate(p.read_text().splitlines(),1):
 if re.search(r'password|secret|token|private.key|credential|authorization',line,re.I):
  print(f'{num}: [redacted]')
 else:
  print(f'{num}: {line[:220]}')
PY
echo '=== POSTGRES HOST RESOLUTION INSIDE API ==='
sudo docker exec varga-cantieri-api node -e 'require("dns").lookup("postgres",(e,a)=>console.log(e ? e.code : a))'
echo 'No database changes or container restarts.'
