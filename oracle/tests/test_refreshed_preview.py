"""Read-only live-data preview must target the refreshed immutable archive."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class RefreshedPreviewTests(unittest.TestCase):
 def test_targets_refresh_without_saving(self):
  js=(ROOT/"original-preview.js").read_text()
  self.assertIn('const ROOT="gestionale_backup_20261027_refresh";',js)
  self.assertIn("api.readSection(ROOT,key)",js)
  self.assertNotIn("api.saveSection(",js)
  self.assertNotIn("api.save(",js)
 def test_publisher_preserves_original_mark_up(self):
  publisher=(ROOT/"publish_original_ui_preview.py").read_text()
  self.assertIn("load_builder().transform(original)",publisher)
  self.assertIn("verify_sources()",publisher)
if __name__=="__main__":unittest.main()
