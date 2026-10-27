#!/usr/bin/env python3
"""Build an EXACT-MARKUP read-only Oracle preview from the existing index.html.

The original HTML and CSS remain unchanged. Only replace the script footer with
a safe Oracle-only bridge. No Firebase scripts and no local/IndexedDB writes.
The output must be published under /oracle/ at the SAME HTTPS domain.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parent.parent
INDEX=ROOT/"index.html"
PAGE=Path(__file__).resolve().parent/"original-preview.html"
START=r"<script\b[^>]*>[\s\S]*?</script>"
HTML_END="</body></html>"
EXPECTED_SCRIPT_COUNT=10
HEAD_MARK='<head>'
BASE='<base href="/">'
PREVIEW_SCRIPTS='<script src="/oracle/client.js"></script><script src="/oracle/original-preview.js"></script>'
SANDBOX_SCRIPTS='<script src="/oracle/client.js"></script><script src="/oracle/section-bridge.js"></script><script src="/oracle/demo-draft-vault.js"></script><script src="/oracle/original-sandbox.js"></script>'

def transform(raw, *, sandbox=False):
    if not raw.startswith("<!doctype html>") or raw.count(HTML_END)!=1:
        raise ValueError("index.html originale non riconosciuto")
    scripts=list(re.finditer(START,raw,flags=re.IGNORECASE))
    if len(scripts)!=EXPECTED_SCRIPT_COUNT:
        raise ValueError("Numero di script originali diverso: fermare il deploy")
    if not all(raw.count(tag)==1 for tag in (
       'id="loginScreen"','class="app-shell"','id="dashboard"',
       'id="clientsList"','id="jobsList"','id="sidebarLogout"'
    )):
        raise ValueError("Componenti grafici originali diversi")
    # All original scripts occur at the very end; no DOM or CSS is altered.
    expected=raw[scripts[0].start():raw.index(HTML_END)]
    if not re.fullmatch(r"(?:<script\b[^>]*>[\s\S]*?</script>)+",expected,
                        flags=re.IGNORECASE):
        raise ValueError("Script non isolati nel footer")
    scripts_to_load=SANDBOX_SCRIPTS if sandbox else PREVIEW_SCRIPTS
    without=raw[:scripts[0].start()]+scripts_to_load+raw[raw.index(HTML_END):]
    if without.count(HEAD_MARK)!=1 or "<base " in without:
        raise ValueError("Head inesperato")
    result=without.replace(HEAD_MARK,HEAD_MARK+BASE,1)
    if "firebasejs" in result.lower() or "app.js?" in result.lower():
        raise ValueError("Script Firebase ancora presenti")
    if "style.css?v=" not in result:
        raise ValueError("Stylesheet originale non trovato")
    if result.count(scripts_to_load)!=1:
        raise ValueError("Bridge Oracle non inserito correttamente")
    return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output",type=Path,default=PAGE)
    p.add_argument("--check",action="store_true")
    p.add_argument("--sandbox",action="store_true",help="Use synthetic-workspace Oracle client script")
    a=p.parse_args()
    try:
        original=INDEX.read_text(encoding="utf-8")
        prepared=transform(original,sandbox=a.sandbox)
        if a.check:
            if not a.output.is_file() or a.output.read_text(encoding="utf-8")!=prepared:
                raise ValueError("Anteprima diversa dall'HTML originale")
            print("PARITÀ HTML: OK. Solo tag base e loader API Oracle diversi.")
            return
        if a.output.is_symlink():
            raise ValueError("Destinazione symlink non consentita")
        if a.output.is_file() and a.output.read_text(encoding="utf-8")!=prepared:
            raise ValueError("La pagina già presente non coincide; nessuna sovrascrittura")
        if not a.output.exists():
            with a.output.open("x",encoding="utf-8") as f:f.write(prepared)
        print("Anteprima HTML originale preparata, stile immutato.")
    except (OSError,UnicodeError,ValueError) as e:
        print("STOP: costruzione anteprima annullata: "+str(e),file=sys.stderr)
        sys.exit(2)

if __name__=="__main__":main()
