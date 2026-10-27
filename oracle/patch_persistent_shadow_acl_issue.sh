#!/usr/bin/env bash
# Repair only the redundant DDL in the persistent shadow source.
# Changes no PostgreSQL grants, database data, Firebase or unrelated services.
set -euo pipefail
base=/home/ubuntu/varga-gestionale-oracle
mapfile -t matches < <(find "$base" -maxdepth 4 -type f -name 'sync.js' -not -path '*/node_modules/*' | sort)
if [ "${#matches[@]}" -ne 1 ]; then
  echo "STOP: expected one persistent sync.js, found ${#matches[@]}. No changes."
  printf '%s\n' "${matches[@]}"
  exit 2
fi
file="${matches[0]}"
echo "Persistent source: $file"
python3 - "$file" <<'PY'
from pathlib import Path
import sys,re,shutil,datetime
p=Path(sys.argv[1])
text=p.read_text()
pattern=r'await pool\.query\(\s*`\s*CREATE TABLE IF NOT EXISTS public\.varga_gestionale_shadow\s*\(.*?\)\s*`\s*\);'
replacement='''const existingShadow = await pool.query("SELECT to_regclass('public.varga_gestionale_shadow') AS table_name");
if (!existingShadow.rows[0]?.table_name) {
  throw new Error("Shadow table missing: provision it with an administrator before starting sync");
}'''
matches=list(re.finditer(pattern,text,re.S))
if len(matches)!=1:
 print(f"STOP: expected one exact legacy DDL block, found {len(matches)}. No changes.")
 sys.exit(3)
if 'firebase-admin' not in text or 'public.varga_gestionale_shadow' not in text:
 print('STOP: unexpected application source')
 sys.exit(4)
backup=p.with_name(p.name+'.before-acl-fix-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
shutil.copy2(p,backup)
p.write_text(text[:matches[0].start()]+replacement+text[matches[0].end():])
print('Backup:',backup)
print('Patched:',p)
print('The running container is UNCHANGED. No restart or rebuild performed.')
PY
