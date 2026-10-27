from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]/"import_refresh_snapshot_once.sh"
class ImmutableRefreshTests(unittest.TestCase):
 def test_refresh_is_isolated_and_fail_closed(self):
  s=P.read_text()
  for t in ("set -euo pipefail","gestionale_backup_20261027_refresh","--dry-run","--verify-existing","--confirm-sha256","if got!=obj[\"data\"]","prepare_reconciled_stage.py"):
   self.assertIn(t,s)
  for bad in ("DROP TABLE","DELETE FROM","TRUNCATE","gestionale_sandbox_20261027","docker compose up","publish_original_sandbox"):
   self.assertNotIn(bad,s)
if __name__=="__main__":unittest.main()
