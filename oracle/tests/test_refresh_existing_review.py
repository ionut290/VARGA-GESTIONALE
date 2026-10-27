"""Ensure a reconciled Oracle snapshot may itself be an input to a later snapshot."""
import importlib.util
from pathlib import Path
import unittest
p=Path(__file__).resolve().parents[1]/"prepare_reconciled_stage.py"
spec=importlib.util.spec_from_file_location("reconcile",p)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class RefreshReview(unittest.TestCase):
 def test_historical_review_carries_over(self):
  old={"app":"Varga Gestionale","createdAt":"2026-10-27","data":{"clients":[{"id":"a"}],"migrationReview":{"previous":"preserve"}}}
  live={"app":"Varga Gestionale","workspace":"varga-azienda","exported_at":"2026-10-27T14:00:00Z","source_mode":"incremental-v3","data":{"clients":[{"id":"a"},{"id":"b"}]},"local_browser_archive":{"clients":[{"id":"a"},{"id":"b"}]}}
  merged,conflicts,absent=mod.build(old,live)
  self.assertEqual(merged["clients"],live["data"]["clients"])
  self.assertEqual(merged["migrationReview"]["previousReview"],{"previous":"preserve"})
  self.assertFalse(conflicts)
 def test_current_review_rejected(self):
  with self.assertRaises(ValueError):
   mod.validate_sect({"migrationReview":{}},allow_historical_review=False)
if __name__=="__main__":unittest.main()
