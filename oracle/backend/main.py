"""Independent Varga Gestionale PostgreSQL API, pilot only. No Firebase."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import re
import secrets
from typing import Annotated, Any
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None

DATABASE_URL = os.getenv("DATABASE_URL", "")
ALLOWED_ORIGINS = [x.strip() for x in os.getenv("VG_ALLOWED_ORIGINS", "").split(",") if x.strip()]
SESSION_HOURS = max(1, min(24, int(os.getenv("VG_SESSION_HOURS", "12"))))
MAX_BODY = 16 * 1024 * 1024
WORKSPACE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SECTION_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
PH = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
app = FastAPI(title="Varga Gestionale Oracle API", version="0.1.0", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=False,
                   allow_methods=["GET","PUT","POST"], allow_headers=["Authorization","Content-Type"])

@contextmanager
def db():
    if not DATABASE_URL or psycopg is None:
        raise HTTPException(503, "Database non configurato")
    try:
        with psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=5) as connection:
            yield connection
    except psycopg.Error:
        raise HTTPException(503, "Database temporaneamente non disponibile") from None

@app.middleware("http")
async def body_limit(request: Request, call_next):
    if request.method in ("PUT", "POST"):
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            size = MAX_BODY + 1
        if size > MAX_BODY:
            return JSONResponse(status_code=413, content={"detail":"Richiesta troppo grande"})
    return await call_next(request)

class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=512)
class WorkspaceIn(BaseModel):
    expected_revision: int = Field(ge=0)
    data: dict[str, Any]

@app.get("/api/gestionale/v1/health")
def health():
    if not DATABASE_URL or psycopg is None:
        return JSONResponse(status_code=503, content={"service":"varga-gestionale","ready":False})
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=3) as con:
            con.execute("SELECT 1")
    except psycopg.Error:
        return JSONResponse(status_code=503, content={"service":"varga-gestionale","ready":False})
    return {"service":"varga-gestionale","ready":True}

def bearer_user(authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Autenticazione necessaria")
    token = authorization[7:].strip()
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise HTTPException(401, "Sessione non valida")
    digest = hashlib.sha256(token.encode()).hexdigest()
    with db() as con:
        user = con.execute("""SELECT u.id,u.email,u.display_name,u.role,u.active
                 FROM vg.sessions s JOIN vg.users u ON u.id=s.user_id
                 WHERE s.token_sha256=%s AND s.expires_at>now() AND u.active=TRUE""",
                 (digest,)).fetchone()
    if not user:
        raise HTTPException(401, "Sessione scaduta o non autorizzata")
    return user

@app.post("/api/gestionale/v1/auth/login")
def login(body: LoginIn):
    email = body.email.strip().casefold()
    if "@" not in email:
        raise HTTPException(401, "Credenziali non valide")
    with db() as con:
        user = con.execute("SELECT * FROM vg.users WHERE email=%s FOR UPDATE",(email,)).fetchone()
        if not user or not user["active"] or (user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc)):
            # Expensive comparison for missing user, without leaking an account's existence.
            try:
                PH.verify("$argon2id$v=19$m=65536,t=3,p=2$J2oNe8YI7wWXZhfyRncVww$wjphUVnvRytvTHlLeCCwOlJOxmooevcOl9w0UDkeA5c", body.password)
            except Exception:
                pass
            raise HTTPException(401, "Credenziali non valide")
        try:
            PH.verify(user["password_hash"], body.password)
        except (VerifyMismatchError, VerificationError):
            count = int(user["failed_attempts"] or 0) + 1
            lock = datetime.now(timezone.utc) + timedelta(minutes=15) if count >= 7 else None
            con.execute("UPDATE vg.users SET failed_attempts=%s,locked_until=%s WHERE id=%s",(count,lock,user["id"]))
            con.commit()
            raise HTTPException(401, "Credenziali non valide")
        con.execute("UPDATE vg.users SET failed_attempts=0,locked_until=NULL WHERE id=%s",(user["id"],))
        token = secrets.token_hex(32)
        con.execute("INSERT INTO vg.sessions(token_sha256,user_id,expires_at) VALUES (%s,%s,%s)",
                    (hashlib.sha256(token.encode()).hexdigest(),user["id"],
                    datetime.now(timezone.utc)+timedelta(hours=SESSION_HOURS)))
        con.commit()
    return {"access_token":token,"token_type":"bearer","expires_in":SESSION_HOURS*3600,
            "user":{"id":str(user["id"]),"email":user["email"],"display_name":user["display_name"],"role":user["role"]}}

@app.get("/api/gestionale/v1/auth/me")
def me(user=Depends(bearer_user)):
    return {"id":str(user["id"]),"email":user["email"],"display_name":user["display_name"],"role":user["role"]}

@app.post("/api/gestionale/v1/auth/logout")
def logout(authorization: Annotated[str | None, Header()] = None, user=Depends(bearer_user)):
    digest=hashlib.sha256(authorization[7:].strip().encode()).hexdigest()
    with db() as con:
        con.execute("DELETE FROM vg.sessions WHERE token_sha256=%s AND user_id=%s",(digest,user["id"]))
        con.commit()
    return {"ok":True}

def assert_workspace(con,user,workspace,writable=False):
    if not WORKSPACE_PATTERN.fullmatch(workspace):
        raise HTTPException(400, "Identificativo workspace non valido")
    allowed=con.execute("SELECT can_write FROM vg.workspace_members WHERE workspace_id=%s AND user_id=%s",
                        (workspace,user["id"])).fetchone()
    if not allowed or (writable and not allowed["can_write"]):
        raise HTTPException(403, "Workspace non autorizzato")

@app.get("/api/gestionale/v1/workspaces/{workspace}")
def get_workspace(workspace: str, user=Depends(bearer_user)):
    with db() as con:
        assert_workspace(con,user,workspace)
        doc=con.execute("SELECT revision,snapshot,updated_at FROM vg.workspaces WHERE id=%s",(workspace,)).fetchone()
    if not doc:
        return {"workspace":workspace,"revision":0,"data":{},"updated_at":None}
    return {"workspace":workspace,"revision":doc["revision"],"data":doc["snapshot"],
            "updated_at":doc["updated_at"].isoformat() if doc["updated_at"] else None}

@app.put("/api/gestionale/v1/workspaces/{workspace}")
def put_workspace(workspace: str, body: WorkspaceIn, user=Depends(bearer_user)):
    raw=json.dumps(body.data, ensure_ascii=False, separators=(",",":"),allow_nan=False)
    if len(raw.encode("utf-8"))>MAX_BODY:
        raise HTTPException(413, "Archivio troppo grande")
    with db() as con:
        assert_workspace(con,user,workspace,writable=True)
        con.execute("INSERT INTO vg.workspaces(id,revision,snapshot) VALUES(%s,0,%s::jsonb) ON CONFLICT DO NOTHING",
                    (workspace,"{}"))
        if con.execute("SELECT 1 FROM vg.workspace_sections WHERE workspace_id=%s LIMIT 1",(workspace,)).fetchone():
            con.rollback()
            raise HTTPException(409, "Archivio a sezioni: usare gli endpoint /sections")
        current=con.execute("SELECT revision FROM vg.workspaces WHERE id=%s FOR UPDATE",(workspace,)).fetchone()["revision"]
        if current!=body.expected_revision:
            con.rollback()
            raise HTTPException(409,{"reason":"revision_conflict","current_revision":current})
        new=con.execute("""UPDATE vg.workspaces SET revision=revision+1,snapshot=%s::jsonb,
                           updated_at=now(),updated_by=%s WHERE id=%s RETURNING revision,updated_at""",
                        (raw,user["id"],workspace)).fetchone()
        con.execute("INSERT INTO vg.workspace_audit(workspace_id,user_id,revision,sha256) VALUES(%s,%s,%s,%s)",
                    (workspace,user["id"],new["revision"],hashlib.sha256(raw.encode()).hexdigest()))
        con.commit()
    return {"workspace":workspace,"revision":new["revision"],"updated_at":new["updated_at"].isoformat()}

# Modern sectional endpoints: avoid moving the full 19 MB archive on each edit.
@app.get("/api/gestionale/v1/workspaces/{workspace}/manifest")
def sections_manifest(workspace: str, user=Depends(bearer_user)):
    with db() as con:
        assert_workspace(con,user,workspace)
        rows=con.execute("""SELECT section,revision,updated_at,
                 CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS item_count
                 FROM vg.workspace_sections WHERE workspace_id=%s ORDER BY section""",(workspace,)).fetchall()
    return {"workspace":workspace,"sections":{row["section"]:{"revision":row["revision"],
              "count":row["item_count"],"updated_at":row["updated_at"].isoformat()} for row in rows}}

@app.get("/api/gestionale/v1/workspaces/{workspace}/sections/{section}")
def get_section(workspace: str, section: str, user=Depends(bearer_user)):
    if not SECTION_PATTERN.fullmatch(section):raise HTTPException(400,"Sezione non valida")
    with db() as con:
        assert_workspace(con,user,workspace)
        row=con.execute("SELECT revision,data,updated_at FROM vg.workspace_sections WHERE workspace_id=%s AND section=%s",
                        (workspace,section)).fetchone()
        if not row:
            # Legacy monolithic snapshot available only if sections have not been imported.
            old=con.execute("SELECT snapshot FROM vg.workspaces WHERE id=%s",(workspace,)).fetchone()
            if old and section in old["snapshot"]:
                return {"workspace":workspace,"section":section,"revision":0,"data":old["snapshot"][section],"updated_at":None}
            return {"workspace":workspace,"section":section,"revision":0,"data":None,"updated_at":None}
    return {"workspace":workspace,"section":section,"revision":row["revision"],
            "data":row["data"],"updated_at":row["updated_at"].isoformat()}

@app.put("/api/gestionale/v1/workspaces/{workspace}/sections/{section}")
def put_section(workspace: str, section: str, body: WorkspaceIn, user=Depends(bearer_user)):
    if not SECTION_PATTERN.fullmatch(section):raise HTTPException(400,"Sezione non valida")
    raw=json.dumps(body.data,ensure_ascii=False,separators=(",",":"),allow_nan=False)
    # The route accepts a single section wrapped in {"value":...} to retain a
    # stable Pydantic body shape without accepting an entire workspace.
    if set(body.data)!={"value"}:raise HTTPException(422,"Inviare solamente il campo value")
    serialized=json.dumps(body.data["value"],ensure_ascii=False,separators=(",",":"),allow_nan=False)
    if len(serialized.encode("utf-8"))>MAX_BODY:raise HTTPException(413,"Sezione troppo grande")
    with db() as con:
        assert_workspace(con,user,workspace,writable=True)
        con.execute("INSERT INTO vg.workspaces(id,revision,snapshot) VALUES(%s,0,'{}'::jsonb) ON CONFLICT DO NOTHING",(workspace,))
        existing=con.execute("""SELECT revision FROM vg.workspace_sections
                                   WHERE workspace_id=%s AND section=%s FOR UPDATE""",(workspace,section)).fetchone()
        current=existing["revision"] if existing else 0
        if current!=body.expected_revision:
            con.rollback()
            raise HTTPException(409,{"reason":"revision_conflict","current_revision":current})
        if existing:
            next_revision=current+1
            con.execute("""UPDATE vg.workspace_sections SET revision=%s,data=%s::jsonb,updated_at=now(),updated_by=%s
                           WHERE workspace_id=%s AND section=%s""",(next_revision,serialized,user["id"],workspace,section))
        else:
            next_revision=1
            con.execute("""INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_by)
                           VALUES(%s,%s,%s,%s::jsonb,%s)""",(workspace,section,next_revision,serialized,user["id"]))
        con.execute("""INSERT INTO vg.workspace_section_audit(workspace_id,section,user_id,revision,sha256)
                       VALUES(%s,%s,%s,%s,%s)""",
                    (workspace,section,user["id"],next_revision,hashlib.sha256(serialized.encode()).hexdigest()))
        con.commit()
    return {"workspace":workspace,"section":section,"revision":next_revision}
