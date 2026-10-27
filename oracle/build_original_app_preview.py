#!/usr/bin/env python3
"""Build a full original-markup Oracle copy with an isolated data adapter."""
from __future__ import annotations
import argparse
from pathlib import Path
import re
import sys

ROOT=Path(__file__).resolve().parent.parent
PAGE=Path(__file__).resolve().parent/"original-app.html"
HTML_END="</body></html>"
SCRIPT_BLOCK=re.compile(r"<script\b[^>]*>[\s\S]*?</script>",re.IGNORECASE)
LOADER=(
    '<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>'
    '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>'
    '<script src="/oracle/client.js"></script>'
    '<script src="/oracle/original-app-bootstrap.js"></script>'
)

def transform(raw:str)->str:
    if not raw.startswith("<!doctype html>") or raw.count(HTML_END)!=1:
        raise ValueError("index.html originale non riconosciuto")
    blocks=list(SCRIPT_BLOCK.finditer(raw))
    if len(blocks)!=10:
        raise ValueError("Numero di script originali diverso: fermare la preparazione")
    if not all(raw.count(tag)==1 for tag in ('id="loginScreen"','class="app-shell"',
       'id="dashboard"','id="clientsList"','id="sidebarLogout"')):
        raise ValueError("Markup grafico originale diverso")
    first=blocks[0].start()
    footer=raw[first:raw.index(HTML_END)]
    if not re.fullmatch(r"(?:<script\b[^>]*>[\s\S]*?</script>)+",footer,flags=re.IGNORECASE):
        raise ValueError("Gli script originali non sono tutti nel footer")
    result=raw[:first]+LOADER+raw[raw.index(HTML_END):]
    if result.count("<head>")!=1 or "<base " in result:
        raise ValueError("Head HTML inatteso")
    result=result.replace("<head>",'<head><base href="/"><meta http-equiv="Content-Security-Policy" content="default-src \'self\' https: data: blob:; connect-src \'self\'; script-src \'self\' \'unsafe-inline\' https:; style-src \'self\' \'unsafe-inline\' https:; img-src \'self\' data: blob: https:; object-src \'none\'; base-uri \'self\'; form-action \'self\'">',1)
    low=result.lower()
    if "firebasejs" in low or "src=\"app.js" in low or "src=\"/app.js" in low:
        raise ValueError("Script Firebase/originale non escluso dalla copia Oracle")
    if result.count(LOADER)!=1 or "style.css?v=" not in result:
        raise ValueError("Loader o CSS originale mancanti")
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path,default=PAGE);parser.add_argument("--check",action="store_true");args=parser.parse_args()
    try:
        prepared=transform((ROOT/"index.html").read_text(encoding="utf-8"))
        if args.check:
            if not args.output.is_file() or args.output.read_text(encoding="utf-8")!=prepared:
                raise ValueError("Copia originale diversa dall'HTML di partenza")
            print("PARITÀ HTML: OK. Markup e CSS originali invariati; bootstrap Oracle isolato.");return
        if args.output.is_symlink():raise ValueError("Destinazione symlink non consentita")
        if args.output.exists() and args.output.read_text(encoding="utf-8")!=prepared:
            raise ValueError("La copia già presente non coincide; nessuna sovrascrittura")
        if not args.output.exists():args.output.write_text(prepared,encoding="utf-8")
        print("Copia HTML originale preparata in sola modalità Oracle sandbox.")
    except (OSError,UnicodeError,ValueError) as exc:
        print("STOP: "+str(exc),file=sys.stderr);sys.exit(2)

if __name__=="__main__":main()
