"""Candidate copy must be independent, exact, and read-only."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class Candidate(unittest.TestCase):
 def test_atomic_copy_and_read_only_grants(self):
  s=(ROOT/"create_readonly_candidate.sql").read_text()
  for term in ("BEGIN;","COMMIT;","gestionale_backup_20261027_refresh","gestionale_candidate_20261027","EXCEPT","can_write)","m.user_id,FALSE","RAISE EXCEPTION"):
   self.assertIn(term,s)
  for bad in ("DROP TABLE","DELETE FROM","TRUNCATE","UPDATE vg.workspace_sections"):
   self.assertNotIn(bad,s)
if __name__=="__main__":unittest.main()
