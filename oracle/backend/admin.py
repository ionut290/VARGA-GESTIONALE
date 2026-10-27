"""Manage Oracle pilot accounts and import privately; passwords prompted, never logged."""
import argparse
from getpass import getpass
import json
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
        path=Path(args.file)
        if not path.is_file():ap.error("File non trovato")
        obj=json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(obj,dict):ap.error("Formato non valido")
        if isinstance(obj.get("data"),dict):payload=obj["data"]
        elif isinstance(obj.get("snapshotJson"),str):payload=json.loads(obj["snapshotJson"])
        else:payload=obj
        if not isinstance(payload,dict) or not payload:ap.error("Snapshot vuoto o non valido")
        if "workspace" in obj and obj["workspace"]!=args.workspace:ap.error("Workspace diverso dall'export")
        raw=json.dumps(payload,ensure_ascii=False,allow_nan=False)
        print("Dimensioni:",{k:len(v) for k,v in payload.items() if isinstance(v,list)},"bytes",len(raw.encode("utf-8")))
        if args.dry_run:
            print("SOLO VERIFICA: database non modificato");return
        if input("Digita IMPORTA per procedere: ")!="IMPORTA":
            print("Annullato");return
        with db() as con:
            existing=con.execute("SELECT revision FROM vg.workspaces WHERE id=%s FOR UPDATE",(args.workspace,)).fetchone()
            if existing and existing["revision"]!=0:ap.error("Workspace non vuoto: importazione rifiutata")
            if existing:con.execute("UPDATE vg.workspaces SET snapshot=%s::jsonb,revision=1,updated_at=now() WHERE id=%s",(raw,args.workspace))
            else:con.execute("INSERT INTO vg.workspaces(id,revision,snapshot) VALUES(%s,1,%s::jsonb)",(args.workspace,raw))
            con.commit()
        print("Importazione completata:",args.workspace)
if __name__=="__main__":main()
