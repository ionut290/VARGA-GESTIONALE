"""Safety and markup-parity checks for the Oracle-hosted original app copy."""
from pathlib import Path
import unittest
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"oracle"))
from build_original_app_preview import transform

class OriginalAppOracleCopyTest(unittest.TestCase):
    def test_original_markup_is_preserved_and_cloud_bootstrap_is_removed(self):
        source=(ROOT/"index.html").read_text(encoding="utf-8")
        page=transform(source)
        self.assertIn('href="style.css?',page)
        self.assertIn("original-app-bootstrap.js",page)
        self.assertIn('id="commesse"',page)
        self.assertNotIn("firebasejs",page.lower())
        self.assertNotIn('src="app.js',page)
        self.assertIn("connect-src 'self'",page)
        self.assertEqual(page.count("<main>"),source.count("<main>"))

    def test_bootstrap_namespaces_browser_storage_and_skips_firebase_writers(self):
        bootstrap=(ROOT/"oracle"/"original-app-bootstrap.js").read_text(encoding="utf-8")
        for marker in ("vg-oracle-preview:","Object.defineProperty(window,\"localStorage\"",
                       '"app-cloud.js"','"cloud-incremental-sync.js"',
                       '"job-plant-management.js"','"map-mail-bridge.js"'):
            self.assertIn(marker,bootstrap)
        self.assertNotIn("firebase-app-compat.js",bootstrap)

    def test_adapter_only_saves_to_oracle_revisioned_sections(self):
        adapter=(ROOT/"oracle"/"original-app-adapter.js").read_text(encoding="utf-8")
        self.assertIn("api.manifest(ROOT)",adapter)
        self.assertIn("api.readSection(ROOT,key)",adapter)
        self.assertIn("api.saveSection(ROOT,key,value)",adapter)
        self.assertNotIn("firebase.firestore",adapter)
        self.assertNotIn("api.save(",adapter)

if __name__=="__main__":unittest.main()
