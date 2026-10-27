"""Ensure Oracle write tests can never target the real business archive."""
import importlib.util
from pathlib import Path
from unittest.mock import patch
import unittest

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("verify_oracle_sandbox",root/"verify_oracle_sandbox.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class SandboxSafetyTests(unittest.TestCase):
    def test_real_backup_is_not_demo(self):
        self.assertNotEqual(mod.SANDBOX,mod.STAGING)
        self.assertRegex(mod.SANDBOX,r"^gestionale_sandbox_[0-9]{8}$")
        self.assertRegex(mod.STAGING,r"^gestionale_backup_[0-9]{8}$")

    def test_run_only_writes_to_sandbox_clients_and_logout(self):
        calls=[]
        sample=[{"id":"demo-cl-01","name":"DEMO","note":"prima"}]
        def stub(path,method="GET",payload=None,token=None,allowed=(200,)):
            calls.append((path,method,payload))
            if path=="health":return 200,{"ready":True}
            if path=="auth/login":
                return 200,{"access_token":"a"*64}
            if path=="auth/me":return 200,{"role":"admin","email":"sample@example.com"}
            if path.endswith("/manifest"):
                if mod.STAGING in path:
                    return 200,{"sections":{"section"+str(i):{} for i in range(30)}}
                return 200,{"sections":{key:{"count":1} for key in ("clients","jobs","quotes","consuntivi")}}
            if path=="auth/logout":return 200,{"ok":True}
            if path.endswith("/sections/clients"):
                if method=="GET":
                    rev=3 if sum(1 for c in calls if c[1]=="PUT")>=3 else 1
                    return 200,{"revision":rev,"data":sample}
                if len([c for c in calls if c[1]=="PUT"])==2:
                    return 409,{"detail":"conflict"}
                if len([c for c in calls if c[1]=="PUT"])==1:
                    return 200,{"revision":2}
                return 200,{"revision":3}
            raise AssertionError("Unexpected path "+path)
        with patch.object(mod,"call",side_effect=stub),patch.object(mod,"getpass",return_value="test-password"):
            mod.verify("sample@example.com")
        writes=[r for r in calls if r[1]=="PUT"]
        self.assertEqual(len(writes),3)
        for path,_,payload in writes:
            self.assertIn(mod.SANDBOX,path)
            self.assertNotIn(mod.STAGING,path)
            self.assertEqual(set(payload),{"expected_revision","data"})
        self.assertEqual([w[2]["expected_revision"] for w in writes],[1,1,2])
        self.assertTrue(any(m=="POST" and p=="auth/logout" for p,m,_ in calls))

    def test_sandbox_creator_does_not_modify_real_sections(self):
        content=(root/"create_oracle_sandbox.sh").read_text(encoding="utf-8")
        self.assertIn("BEGIN;",content)
        self.assertIn("COMMIT;",content)
        self.assertIn("can_write=false",content)
        self.assertIn("gestionale_sandbox_20261027",content)
        self.assertNotIn("UPDATE vg.workspace_sections",content)
        self.assertNotIn("DELETE FROM vg.workspace_sections",content)

if __name__=="__main__": unittest.main()
