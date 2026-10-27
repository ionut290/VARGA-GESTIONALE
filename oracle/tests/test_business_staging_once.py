from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]/"audit_business_staging_once.sh"
class SafeStagingAudit(unittest.TestCase):
 def test_read_only_and_required_identity(self):
  script=P.read_text()
  for required in ("set -euo pipefail","audit_production_cutover.py","verify_staging_import.py","gestionale_backup_20261027","gestionale_sandbox_20261027"):
   self.assertIn(required,script)
  for forbidden in ("INSERT INTO","UPDATE vg.","DELETE FROM","import-snapshot","docker compose up","git reset","DROP TABLE"):
   self.assertNotIn(forbidden,script)
if __name__=="__main__":
 unittest.main()
