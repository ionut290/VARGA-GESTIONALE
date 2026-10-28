"""Manage Oracle pilot accounts and import privately; passwords prompted, never logged."""
import argparse
from getpass import getpass
import json
import re
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
    actions.add_parser("list-users")
    rp=actions.add_parser("reset-password")
    rp.add_argument("--email",required=True)
    sr=actions.add_parser("set-role")
    sr.add_argument("--email",required=True)
    sr.add_argument("--role",choices=["admin","ufficio","operatore"],required=True)
    sm=actions.add_parser("set-membership")
    sm.add_argument("--email",required=True)
    sm.add_argument("--workspace",required=True)
    sm.add_argument("--access",choices=["read-only","read-write"],required=True)
    args=ap.parse_args()
    if hasattr(args,"workspace") and not WORKSPACE_PATTERN.fullmatch(args.workspace):ap.error("Workspace non valido")
    if args.action=="list-users":
        with db() as con:
            rows=con.execute("""SELECT u.email,u.display_name,u.role,u.active,u.locked_until,
                       COALESCE(jsonb_agg(jsonb_build_object('workspace',m.workspace_id,'can_write',m.can_write)
                         ORDER BY m.workspace_id) FILTER (WHERE m.workspace_id IS NOT NULL),'[]'::jsonb) AS workspaces
                       FROM vg.users u LEFT JOIN vg.workspace_members m ON m.user_id=u.id
                       GROUP BY u.id ORDER BY u.email""").fetchall()
        print(json.dumps([dict(row) for row in rows],ensure_ascii=False,default=str,indent=2))
    elif args.action=="reset-password":
        email=args.email.strip().casefold()
        if "@" not in email:ap.error("Email non valida")
        password=getpass("Nuova password Oracle (12+ caratteri): ")
        if len(password)<12:ap.error("Password troppo breve")
        if password!=getpass("Ripeti password: "):ap.error("Le password sono diverse")
        if input("Per revocare tutte le sessioni e reimpostare la password, digita RESET: ")!="RESET":
            print("Annullato");return
        digest=PasswordHasher(time_cost=3,memory_cost=65536,parallelism=2).hash(password)
        with db() as con:
            user=con.execute("SELECT id FROM vg.users WHERE email=%s FOR UPDATE",(email,)).fetchone()
            if not user:ap.error("Utente non trovato")
            con.execute("UPDATE vg.users SET password_hash=%s,failed_attempts=0,locked_until=NULL WHERE id=%s",
                        (digest,user["id"]))
            con.execute("DELETE FROM vg.sessions WHERE user_id=%s",(user["id"],))
            con.commit()
        print("Password aggiornata; tutte le sessioni dell'utente sono state revocate.")
    elif args.action=="set-role":
        email=args.email.strip().casefold()
        if "@" not in email:ap.error("Email non valida")
        if input(f"Per assegnare il ruolo {args.role} a {email} e revocare tutte le sessioni, digita RUOLO: ")!="RUOLO":
            print("Annullato");return
        with db() as con:
            user=con.execute("SELECT id,role,active FROM vg.users WHERE email=%s FOR UPDATE",(email,)).fetchone()
            if not user:ap.error("Utente non trovato")
            if user["role"]=="admin" and user["active"] and args.role!="admin":
                admins=con.execute("SELECT count(*) AS n FROM vg.users WHERE role='admin' AND active=TRUE").fetchone()["n"]
                if admins<=1:ap.error("Impossibile rimuovere l'unico amministratore attivo")
            con.execute("UPDATE vg.users SET role=%s WHERE id=%s",(args.role,user["id"]))
            con.execute("DELETE FROM vg.sessions WHERE user_id=%s",(user["id"],))
            con.commit()
        print("Ruolo aggiornato; tutte le sessioni dell'utente sono state revocate.")
    elif args.action=="set-membership":
        email=args.email.strip().casefold()
        if "@" not in email:ap.error("Email non valida")
        writable=args.access=="read-write"
        if writable and args.workspace.startswith(("gestionale_backup_","gestionale_candidate_")):
            ap.error("Gli archivi backup/candidate non possono ricevere accesso in scrittura")
        verb="concedere scrittura" if writable else "concedere sola lettura"
        if input(f"Per {verb} a {email} nel workspace {args.workspace}, digita ACCESSO: ")!="ACCESSO":
            print("Annullato");return
        with db() as con:
            user=con.execute("SELECT id FROM vg.users WHERE email=%s FOR UPDATE",(email,)).fetchone()
            if not user:ap.error("Utente non trovato")
            workspace=con.execute("SELECT 1 FROM vg.workspaces WHERE id=%s",(args.workspace,)).fetchone()
            if not workspace:ap.error("Workspace non trovato")
            con.execute("""INSERT INTO vg.workspace_members(workspace_id,user_id,can_write) VALUES(%s,%s,%s)
                           ON CONFLICT(workspace_id,user_id) DO UPDATE SET can_write=EXCLUDED.can_write""",
                        (args.workspace,user["id"],writable))
            con.execute("DELETE FROM vg.sessions WHERE user_id=%s",(user["id"],))
            con.commit()
        print("Accesso workspace aggiornato; tutte le sessioni dell'utente sono state revocate.")
    elif args.action=="create-user":
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
        # A source-export workspace is intentionally different from a dated staging
        # workspace. Never allow a source mismatch when importing into production.
        if "workspace" in obj and obj["workspace"]!=args.workspace:
            if not (re.fullmatch(r"gestionale_backup_20[0-9]{6}",args.workspace) and
                    obj["workspace"]=="varga-azienda"):
                ap.error("Workspace sorgente diverso: importazione rifiutata")
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
