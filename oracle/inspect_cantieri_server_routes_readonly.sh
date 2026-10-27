#!/usr/bin/env bash
# Read-only API code inspection: routes and DB operations, no secret values.
set -euo pipefail
source_file=/home/ubuntu/varga-cantieri/api/server.cjs
test -f "$source_file" || { echo "STOP: source file not found"; exit 2; }
python3 - "$source_file" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1])
lines=p.read_text(errors='replace').splitlines()
print("Source:",p,"lines:",len(lines))
needles=[r'postgres',r'Pool\(',r'pg\b',r'firestore',r'INSERT\b',r'UPDATE\b',r'DELETE\b',r'CREATE TABLE',r'app\.(get|post|put|patch|delete)',r'router\.',r'listen\(',r'DATABASE_URL',r'firebase']
selected=[]
for i,line in enumerate(lines,1):
 if any(re.search(needle,line,re.I) for needle in needles): selected.append((i,line))
for i,line in selected[:110]:
 if re.search(r'password|secret|token|private.key|credential|authorization|api.key',line,re.I):
  print(f"{i}: [sensitive line omitted]")
 else:
  # Avoid dumping contents of arbitrary string literals; show only keywords.
  filtered=re.sub(r'(["\x27])(?:(?!\1).){30,}\1',r'\1[long literal omitted]\1',line)
  print(f"{i}: {filtered[:180]}")
print("Matched lines:",len(selected))
PY
echo "No modifications performed."
