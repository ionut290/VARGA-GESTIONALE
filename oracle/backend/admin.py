"""Manage Oracle pilot accounts and import privately; passwords prompted, never logged."""
import argparse
from getpass import getpass
import json
import hashlib
import sys
from pathlib import Path
from argon2 import PasswordHasher
from .main import db, WORKSPACE_PATTERN

def main():
    ap=argparse.ArgumentParser()
    actions=ap.add_subparsers(dest="action", required=True)
    u=actions.add_parser("create-user")
    u.add_argument("--email",required=True)
    u.add_argument("--role",choices=["admin","ufficio","operatore"],default="operatore")
    u.add_argument("--workspace",default="varga-azienda")
    u.add_argument("--read-only",action="store_true")
    imp=actions.add_parser("import-snapshot")
    imp.add_argument("--file",required=True)
    imp.add_argument("--workspace",default="varga-azienda")
    imp.add_argument("--dry-run",action="store_true")
    imp.add_argument("--confirm-sha256",default="",help="Required for non-interactive import from stdin")
    args=ap.parse_args()
    if not WORKSPACE_PATTERN.fullmatch(args.workspace):ap.error("Workspace non valido")
    if args.action=="create-user":
        email=args.email.strip().casefold()
        if "@" not in email:ap.error("Email non valida")
        password=getpass("Nuova password Oracle (12+ caratteri): ")
        if len(password)<12:ap.error("Password troppo breve")
        if password!=getpass("Ripeti password: "):ap.error("Le password sono diverse")
        digest=PasswordHasher(time_cost=3,memory_cost=65536,parallelism=2).hash(password)
        with db() as con:
            row=con.execute("INSERT INTO vg.users(email,display_name,role,password_hash) VALUES(%s,%s,%s,%s) RETURNING id",
                            (email,email.split("@")[0],args.role,digest)).fetchone()
            con.execute("INSERT INTO vg.workspace_members(workspace_id,user_id,can_write) VALUES(%s,%s,%s)",
                        (args.workspace,row["id"],not args.read_only))
            con.commit()
        print("Account Oracle creato",email,"ruolo",args.role)
    else:
        if args.file=="-":
            raw_input=sys.stdin.buffer.read(40_000_001)
            if len(raw_input)>40_000_000:ap.error("Export oltre 40 MB; verificare dimensione e piano import")
        else:
            path=Path(args.file)
            if not path.is_file():ap.error("File non trovato")
            raw_input=path.read_bytes()
        checksum=hashlib.sha256(raw_input).hexdigest()
        obj=json.loads(raw_input.decode("utf-8"))
        if not isinstance(obj,dict):ap.error("Formato non valido")
        if isinstance(obj.get("data"),dict):payload=obj["data"]
        elif isinstance(obj.get("snapshotJson"),str):payload=json.loads(obj["snapshotJson"])
        else:payload=obj
        if not isinstance(payload,dict) or not payload:ap.error("Snapshot vuoto o non valido")
        if "workspace" in obj and obj["workspace"]!=args.workspace:ap.error("Workspace diverso dall'export")
        raw=json.dumps(payload,ensure_ascii=False,allow_nan=False)
        print("Dimensioni:",{k:len(v) for k,v in payload.items() if isinstance(v,list)},"bytes",len(raw.encode("utf-8")))
        print("File SHA256:",checksum)
        if args.dry_run:
            print("SOLO VERIFICA: database non modificato");return
        if args.confirm_sha256:
            if args.confirm_sha256.lower()!=checksum:ap.error("SHA256 non corrispondente: importazione rifiutata")
        elif args.file=="-":
            ap.error("L'importazione via stdin richiede --confirm-sha256")
        elif input("Digita IMPORTA per procedere: ")!="IMPORTA":
            print("Annullato");return
        if not all(k and k[0].isalpha() and k.replace("_","").isalnum() and len(k)<=64 for k in payload):
            ap.error("Nome sezione non valido: importazione interrotta")
        with db() as con:
            existing=con.execute("SELECT revision,snapshot FROM vg.workspaces WHERE id=%s FOR UPDATE",(args.workspace,)).fetchone()
            if existing and (existing["revision"]!=0 or existing["snapshot"]):
                ap.error("Workspace non vuoto: importazione rifiutata")
            if con.execute("SELECT 1 FROM vg.workspace_sections WHERE workspace_id=%s LIMIT 1",(args.workspace,)).fetchone():
                ap.error("Archivio a sezioni già popolato: importazione rifiutata")
            if not existing:
                con.execute("INSERT INTO vg.workspaces(id,revision,snapshot) VALUES(%s,0,'{}'::jsonb)",(args.workspace,))
            for key,value in payload.items():
                part=json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(",",":"))
                con.execute("""INSERT INTO vg.workspace_sections(workspace_id,section,revision,data)
                               VALUES(%s,%s,1,%s::jsonb)""",(args.workspace,key,part))
            con.commit()
        print("Importazione sezionale completata:",args.workspace,"sezioni",len(payload))
if __name__=="__main__":main()
