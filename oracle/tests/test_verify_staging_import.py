"""Verify that resuming an Oracle reconciliation never overwrites an existing staging workspace."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SRC=Path(__file__).resolve().parents[1]/"verify_staging_import.py"
spec=importlib.util.spec_from_file_location("verify_staging_import",SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class VerifyStagingImportTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.file=Path(self.tmp.name)/"stage.json"
        self.payload={
            "app":"Varga Gestionale",
            "sourceWorkspace":"varga-azienda",
            "createdAt":"2026-10-27T05:31:38Z",
            "purpose":"private Oracle staging / reconciled cloud and browser",
            "data":{f"section{i}":[] for i in range(27)}
        }
        self.payload["data"]["migrationReview"]={"historicalOnly":{}}
        self.file.write_text(json.dumps(self.payload),encoding="utf-8")

    def test_already_imported_exact_json(self):
        result=mod.verify(self.file,lambda _:dict(self.payload["data"]))
        self.assertEqual(result,0)

    def test_workspace_empty(self):
        self.assertEqual(mod.verify(self.file,lambda _:{}),3)

    def test_workspace_modified_abort(self):
        db_data=dict(self.payload["data"])
        db_data["section3"]=[{"id":"unexpected"}]
        self.assertEqual(mod.verify(self.file,lambda _:db_data),2)

    def test_unreachable_database_abort(self):
        self.assertRaises(ValueError,mod.verify,self.file,lambda _:None)

    def test_wrong_workspace_abort(self):
        self.payload["sourceWorkspace"]="unrelated"
        self.file.write_text(json.dumps(self.payload),encoding="utf-8")
        self.assertRaises(ValueError,mod.verify,self.file,lambda _:{})

if __name__=="__main__":
    unittest.main()
