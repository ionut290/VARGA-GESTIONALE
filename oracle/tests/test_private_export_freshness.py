from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class PrivateExportSafety(unittest.TestCase):
 def test_no_write_or_firebase_mutation(self):
  s=(ROOT/"check_latest_private_export.sh").read_text()
  for marker in ("set -euo pipefail","Varga-Gestionale-live-latest.json","date<=oldtime","Sezioni con differenze"):
   self.assertIn(marker,s)
  for disallowed in ("docker compose","INSERT INTO","UPDATE vg.","DELETE FROM","firebase-admin","import-snapshot","publish_live"):
   self.assertNotIn(disallowed,s)
if __name__=="__main__":
 unittest.main()
