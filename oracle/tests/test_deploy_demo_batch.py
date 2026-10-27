"""Assert one-shot DEMO deploy never targets production or recreates containers."""
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class DemoDeployTests(unittest.TestCase):
    def test_script_is_demo_only(self):
        sh=(ROOT/"deploy_demo_batch.sh").read_text()
        sql=(ROOT/"extend_remaining_demo.sql").read_text()
        self.assertIn("set -euo pipefail",sh)
        self.assertIn("ON_ERROR_STOP=1",sh)
        self.assertIn("< extend_remaining_demo.sql",sh)
        self.assertIn("python3 publish_original_sandbox.py",sh)
        self.assertIn("ON CONFLICT (workspace_id,section) DO NOTHING",sql)
        self.assertIn("gestionale_sandbox_20261027",sql)
        for value in ("gestionale_backup_20261027","docker compose up","firebase","DROP TABLE","TRUNCATE","DELETE FROM"):
            self.assertNotIn(value,sh+sql)
if __name__=="__main__":
    unittest.main()
