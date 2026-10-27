from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]/"grant_candidate_preview_readonly.sql"
class CandidatePreviewGrants(unittest.TestCase):
 def test_cannot_grant_writes_or_change_records(self):
  sql=P.read_text()
  for marker in ("BEGIN;","COMMIT;","EXCEPT","m.user_id,FALSE","DO UPDATE SET can_write=FALSE","gestionale_candidate_20261027"):
   self.assertIn(marker,sql)
  for forbidden in ("UPDATE vg.workspace_sections","DELETE FROM","DROP TABLE","TRUNCATE","SET can_write=TRUE"):
   self.assertNotIn(forbidden,sql)
if __name__=="__main__":unittest.main()
