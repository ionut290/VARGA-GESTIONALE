#!/usr/bin/env python3
"""Validate Oracle API writes safely on an explicitly synthetic workspace.

Never sends PUT to a real workspace, even to check authorization.
Asks for password via getpass; never saves or prints credentials/session.
Tests login, manifest, read, a synthetic write, revision-conflict rejection,
and restores the original demo payload with a new revision.
"""
from __future__ import annotations
import argparse
from getpass import getpass
import json
import sys
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

API="http://127.0.0.1:18098/api/gestionale/v1/"
SANDBOX="gestionale_sandbox_20261027"
STAGING="gestionale_backup_20261027"
TIMEOUT=12

def call(path,method="GET",payload=None,token=None,allowed=(200,)):
    headers={"Accept":"application/json"}
    if token:headers["Authorization"]="Bearer "+token
    body=None
    if payload is not None:
        body=json.dumps(payload,ensure_ascii=False).encode("utf-8")
        headers["Content-Type"]="application/json"
    request=Request(API+path,method=method,data=body,headers=headers)
    try:
        with urlopen(request,timeout=TIMEOUT) as response:
            status=response.status
            content_type=response.headers.get("Content-Type","").split(";")[0]
            raw=response.read(100_000)
    except HTTPError as e:
        status=e.code
        content_type=e.headers.get("Content-Type","").split(";")[0]
        raw=e.read(100_000)
    if status not in allowed or content_type!="application/json":
        raise ValueError("Risposta Oracle API non prevista: HTTP "+str(status))
    response=json.loads(raw.decode("utf-8"))
    return status,response

def verify(email):
    if "@" not in email or len(email)>255:
        raise ValueError("Email Oracle non valida")
    status,health=call("health")
    if health.get("ready") is not True:raise ValueError("API Oracle non pronta")
    print("API locale pronta: OK")
    password=getpass("Password Oracle per collaudo (non verrà visualizzata): ")
    if not password:raise ValueError("Password vuota")
    _,session=call("auth/login","POST",{"email":email,"password":password})
    del password
    token=session.get("access_token")
    if not isinstance(token,str) or len(token)!=64:
        raise ValueError("Token non ricevuto")
    try:
        _,user=call("auth/me",token=token)
        if user.get("role")!="admin" or user.get("email","").casefold()!=email.casefold():
            raise ValueError("Amministratore non riconosciuto")
        print("Login amministratore Oracle: OK")
        _,manifest=call("workspaces/"+SANDBOX+"/manifest",token=token)
        counts=manifest.get("sections") or {}
        if set(counts)!={"clients","jobs","quotes","consuntivi"}:
            raise ValueError("Sandbox non isolato come previsto: fermo i test")
        if any(v.get("count")!=1 for v in counts.values()):
            raise ValueError("Sandbox modificato: fermo i test senza sovrascrivere")
        _,real=call("workspaces/"+STAGING+"/manifest",token=token)
        if len(real.get("sections") or {})!=30:
            raise ValueError("Archivio reale del 27 ottobre inatteso")
        print("Sandbox isolato: 4 sezioni finte. Archivio reale: 30 sezioni intatte.")
        path="workspaces/"+SANDBOX+"/sections/clients"
        _,original=call(path,token=token)
        if original.get("revision")!=1 or not isinstance(original.get("data"),list):
            raise ValueError("Revisione cliente demo inattesa")
        if len(original["data"])!=1 or original["data"][0].get("id")!="demo-cl-01":
            raise ValueError("Record demo non riconosciuto; non sovrascrivo")
        changed=json.loads(json.dumps(original["data"]))
        changed[0]["note"]="SCRITTURA ORACLE API DI TEST - DATI FITTIZI"
        _,updated=call(path,"PUT",{"expected_revision":1,"data":{"value":changed}},token)
        if updated.get("revision")!=2:
            raise ValueError("Scrittura demo non confermata con revisione 2")
        print("Scrittura di prova, solo record fittizio: OK; revisione 1 → 2")
        status,_=call(path,"PUT",
            {"expected_revision":1,"data":{"value":changed}},token,
            allowed=(409,))
        if status!=409:
            raise ValueError("Protezione modifiche concorrenti non funzionante")
        print("Conflitto su revisione obsoleta: HTTP 409 corretto.")
        _,restored=call(path,"PUT",
            {"expected_revision":2,"data":{"value":original["data"]}},token)
        if restored.get("revision")!=3:
            raise ValueError("Ripristino demo non confermato")
        _,final=call(path,token=token)
        if final.get("data")!=original["data"] or final.get("revision")!=3:
            raise ValueError("Contenuto demo diverso dopo ripristino")
        print("Ripristino dati demo: OK, revisione 3.")
        print("SUCCESSO: salvataggi Oracle e conflitti testati esclusivamente su sandbox.")
    finally:
        try:call("auth/logout","POST",token=token)
        except Exception:pass

def main():
    p=argparse.ArgumentParser(description="Collaudo Oracle con soli dati demo")
    p.add_argument("--email",required=True,help="Email amministratore Oracle")
    args=p.parse_args()
    try:verify(args.email)
    except (ValueError,URLError,TimeoutError,OSError,json.JSONDecodeError) as err:
        print("STOP: collaudo non completato: "+str(err),file=sys.stderr)
        print("Non sono stati inviati cambiamenti all'archivio reale.",file=sys.stderr)
        raise SystemExit(2)

if __name__=="__main__":main()
