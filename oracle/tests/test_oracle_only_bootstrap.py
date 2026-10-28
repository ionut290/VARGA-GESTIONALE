"""Guard the isolated Oracle app bundle against Firebase SDK regressions."""
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "oracle"))
from build_original_app_preview import transform

class OracleOnlyBootstrapTest(unittest.TestCase):
    def test_original_app_cloud_services_are_not_loaded(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        match = re.search(r"\['app-core\.js',([\s\S]*?)\]\.forEach", app)
        self.assertIsNotNone(match, "Elenco moduli dell'app originale non riconosciuto")
        modules = ["app-core.js", *re.findall(r"'([^']+\.js)'", match.group(1))]

        bootstrap = (ROOT / "oracle" / "original-app-bootstrap.js").read_text(encoding="utf-8")
        skipped = re.search(r"const skip=new Set\(\[([\s\S]*?)\]\);", bootstrap)
        self.assertIsNotNone(skipped, "Lista moduli cloud esclusi non trovata")
        excluded = set(re.findall(r'"([^"]+\.js)"', skipped.group(1)))

        # These modules directly depend on Firebase, Firestore or Cloud Functions.
        required = {
            "app-cloud.js", "cloud-users.js", "cloud-incremental-sync.js",
            "job-management-sync.js", "job-plant-management.js",
            "squadre-management-sync.js", "map-mail-bridge.js",
            "user-document-assets.js",
        }
        self.assertTrue(required.issubset(excluded), "Aggiungere alla lista di esclusione: "
                        + ", ".join(sorted(required - excluded)))

        loaded = [name for name in modules if name not in excluded]
        firebase_access = re.compile(
            r"firebase\.(?!firestore\.FieldValue\.(?:serverTimestamp|delete)\b)"
        )
        unsafe = []
        for name in loaded:
            path = ROOT / name
            self.assertTrue(path.is_file(), f"Modulo originale mancante: {name}")
            source = path.read_text(encoding="utf-8")
            if firebase_access.search(source):
                unsafe.append(name)
        self.assertEqual(unsafe, [], "Moduli Oracle caricati con accesso Firebase: "
                         + ", ".join(unsafe))

        # The only Firebase-shaped object in the Oracle runtime is a local,
        # inert compatibility shim used for timestamp/delete helpers.
        self.assertIn("window.firebase={firestore:{FieldValue:{serverTimestamp:()=>new Date(),delete:()=>null}}}", bootstrap)
        self.assertNotIn("initializeApp", bootstrap)
        self.assertNotIn("firebase-app-compat.js", bootstrap)

    def test_built_original_page_excludes_firebase_sdk_and_original_bootstrap(self):
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        page = transform(source).lower()
        self.assertNotIn("firebasejs", page)
        self.assertNotIn("firebase-app-compat.js", page)
        self.assertNotIn('src="app.js', page)
        self.assertIn("original-app-bootstrap.js", page)
        self.assertIn("connect-src 'self'", page)

if __name__ == "__main__":
    unittest.main()
