from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class OriginalAppSandboxCopyTest(unittest.TestCase):
    def test_copy_is_guarded_and_source_is_immutable(self):
        sql=(ROOT/"create_original_app_sandbox.sql").read_text(encoding="utf-8")
        self.assertIn("gestionale_cantieri_sync_20261027",sql)
        self.assertIn("gestionale_varga_ui_sandbox_20261027",sql)
        self.assertIn("nessuna sovrascrittura",sql)
        self.assertIn("EXCEPT",sql)
        self.assertIn("revision,data",sql)
        self.assertNotIn("DELETE FROM",sql.upper())
        self.assertNotIn("TRUNCATE",sql.upper())
        self.assertNotIn("DROP TABLE",sql.upper())
        self.assertNotIn("UPDATE VG.WORKSPACE_SECTIONS",sql.upper())
        self.assertIn("(u.role='admin')",sql)

    def test_wrapper_targets_oracle_database_only(self):
        script=(ROOT/"create_original_app_sandbox.sh").read_text(encoding="utf-8")
        self.assertIn("docker compose -p vg-gestionale-oracle",script)
        self.assertIn("create_original_app_sandbox.sql",script)
        self.assertNotIn("firebase",script.lower())

if __name__=="__main__":unittest.main()
