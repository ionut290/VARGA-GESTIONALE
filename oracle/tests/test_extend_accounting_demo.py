"""Fail-closed static checks for additive DEMO accounting migration."""
from pathlib import Path
import unittest

SQL=(Path(__file__).resolve().parents[1]/"extend_accounting_demo.sql").read_text()

class AccountingDemoMigrationTests(unittest.TestCase):
    def test_isolated_and_additive(self):
        self.assertIn("BEGIN;",SQL)
        self.assertIn("COMMIT;",SQL)
        self.assertIn("ON CONFLICT (workspace_id,section) DO NOTHING",SQL)
        self.assertIn("pg_advisory_xact_lock",SQL)
        self.assertIn("'gestionale_sandbox_20261027'",SQL)
        for section in ("invoices","priceLists","entries"):
            self.assertIn("'"+section+"'",SQL)
        for forbidden in ("gestionale_backup_20261027","UPDATE vg.workspace_sections",
                          "DELETE FROM","DROP TABLE","TRUNCATE","varga-azienda"):
            self.assertNotIn(forbidden,SQL)

if __name__=="__main__":
    unittest.main()
