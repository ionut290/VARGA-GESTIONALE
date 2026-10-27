"""Historical Oracle snapshots must never become writable through the API."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class ImmutableApi(unittest.TestCase):
 def test_backup_write_denied_in_authorization_boundary(self):
  src=(ROOT/"backend/main.py").read_text(encoding="utf-8")
  self.assertIn('if writable and workspace.startswith("gestionale_backup_"):',src)
  self.assertIn('raise HTTPException(403, "Fotografia archivio immutabile: scrittura non consentita")',src)
  self.assertIn('assert_workspace(con,user,workspace,writable=True)',src)
if __name__=="__main__": unittest.main()
