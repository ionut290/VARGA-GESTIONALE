"""Ephemeral CI integration tests against a disposable PostgreSQL 16 container."""
import os
import secrets
import unittest
from pathlib import Path
import psycopg
from fastapi.testclient import TestClient
from backend.main import app, PH

DB=os.environ.get("DATABASE_URL")
class LivePgApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not DB:raise unittest.SkipTest("DATABASE_URL needed for disposable CI Postgres")
        cls.email="test-"+secrets.token_hex(8)+"@example.test"
        cls.password="CI-only-password-24-chars!"
        cls.workspace="test_"+secrets.token_hex(6)
        with psycopg.connect(DB) as connection:
            connection.execute(Path("schema.sql").read_text(encoding="utf-8"))
            cls.user_id=connection.execute("""INSERT INTO vg.users(email,role,password_hash,display_name)
                      VALUES (%s,'admin',%s,'Test CI') RETURNING id""",(cls.email,PH.hash(cls.password))).fetchone()[0]
            cls.operator_email="operator-"+secrets.token_hex(8)+"@example.test"
            cls.operator_password="CI-only-operator-password!"
            cls.operator_id=connection.execute("""INSERT INTO vg.users(email,role,password_hash,display_name)
                      VALUES (%s,'operatore',%s,'Test Operatore') RETURNING id""",
                      (cls.operator_email,PH.hash(cls.operator_password))).fetchone()[0]
            connection.execute("""INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
                    VALUES (%s,%s,TRUE),(%s,%s,TRUE)""",
                    (cls.workspace,cls.user_id,cls.workspace,cls.operator_id))
            connection.commit()
        cls.client=TestClient(app,base_url="https://testserver")
    def token(self,email=None,password=None):
        response=self.client.post("/api/gestionale/v1/auth/login",
            json={"email":email or self.email,"password":password or self.password})
        self.assertEqual(response.status_code,200,response.text)
        return response.json()["access_token"]
    def test_health(self):
        x=self.client.get("/api/gestionale/v1/health")
        self.assertEqual(x.status_code,200,x.text)
        self.assertTrue(x.json()["ready"])
    def test_login_read_write_and_revision_conflict(self):
        headers={"Authorization":"Bearer "+self.token()}
        base=f"/api/gestionale/v1/workspaces/{self.workspace}"
        manifest=self.client.get(base+"/manifest",headers=headers)
        self.assertEqual(manifest.status_code,200,manifest.text)
        self.assertEqual(manifest.json()["sections"],{})
        initial=self.client.get(base+"/sections/clients",headers=headers)
        self.assertEqual(initial.status_code,200,initial.text)
        self.assertEqual(initial.json()["revision"],0)
        item={"expected_revision":0,"data":{"value":[{"id":"one","name":"Synthetic CI"}]}}
        saved=self.client.put(base+"/sections/clients",headers=headers,json=item)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(saved.json()["revision"],1)
        conflict=self.client.put(base+"/sections/clients",headers=headers,json=item)
        self.assertEqual(conflict.status_code,409,conflict.text)
        reread=self.client.get(base+"/sections/clients",headers=headers)
        self.assertEqual(reread.json()["data"][0]["name"],"Synthetic CI")
        self.assertEqual(reread.json()["revision"],1)
        self.assertEqual(self.client.get(base+"/manifest",headers=headers).json()["sections"]["clients"]["count"],1)
        self.assertEqual(self.client.get(base+"/sections/not_here",headers=headers).json()["revision"],0)
        self.assertEqual(self.client.get("/api/gestionale/v1/workspaces/not_authorized/manifest",headers=headers).status_code,403)
        out=self.client.post("/api/gestionale/v1/auth/logout",headers=headers)
        self.assertEqual(out.status_code,200,out.text)
        self.assertEqual(self.client.get(base+"/manifest",headers=headers).status_code,401)
    def test_operator_writes_only_non_admin_sections(self):
        headers={"Authorization":"Bearer "+self.token(self.operator_email,self.operator_password)}
        base=f"/api/gestionale/v1/workspaces/{self.workspace}"
        allowed=self.client.put(base+"/sections/clients",headers=headers,
            json={"expected_revision":0,"data":{"value":[{"id":"operator-client","name":"Allowed"}]}})
        self.assertEqual(allowed.status_code,200,allowed.text)
        for section,value in (("company",{"driveBridge":{"token":"must-not-save"}}),
                              ("vcCommesse",[]),("vcImpianti",[]),("vcOre",[]),
                              ("vcRecords",[]),("vcSegnalazioni",[]),("vcSquadre",[]),("vcUtenti",[])):
            with self.subTest(section=section):
                response=self.client.put(base+"/sections/"+section,headers=headers,
                    json={"expected_revision":0,"data":{"value":value}})
                self.assertEqual(response.status_code,403,response.text)
        whole=self.client.put(base,headers=headers,
            json={"expected_revision":0,"data":{"clients":[]}})
        self.assertEqual(whole.status_code,403,whole.text)

    def test_anonymous_denied(self):
        self.assertEqual(self.client.get("/api/gestionale/v1/workspaces/a/manifest").status_code,401)
        self.assertEqual(self.client.put("/api/gestionale/v1/workspaces/a/sections/clients",
             json={"expected_revision":0,"data":{"value":[]}}).status_code,401)
    def test_remembered_cookie_session_and_logout(self):
        client=TestClient(app,base_url="https://testserver")
        response=client.post("/api/gestionale/v1/auth/login",headers={"X-VG-Session-Mode":"cookie"},json={"email":self.email,"password":self.password,"remember":True})
        self.assertEqual(response.status_code,200,response.text)
        self.assertNotIn("access_token",response.json())
        cookie=response.headers.get("set-cookie","").lower()
        for marker in ("httponly","secure","samesite=strict","max-age="):
            self.assertIn(marker,cookie)
        self.assertEqual(client.get("/api/gestionale/v1/auth/me").status_code,200)
        self.assertEqual(client.post("/api/gestionale/v1/auth/logout").status_code,200)
        self.assertEqual(client.get("/api/gestionale/v1/auth/me").status_code,401)

if __name__=="__main__":unittest.main()
