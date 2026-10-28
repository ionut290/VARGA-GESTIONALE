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
        self.assertIn("__vgOracleBootFail",page)
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

    def test_deployment_bundles_the_oracle_api_client_with_the_adapter(self):
        publisher=(ROOT/"oracle"/"publish_original_app_preview.py").read_text(encoding="utf-8")
        self.assertIn('files["client.js"]=SRC/"client.js"',publisher)
        self.assertIn("/oracle/original-app-'+digest+'-client.js",publisher)
        self.assertIn("public reverse proxy too",publisher)
        self.assertIn("asset_response.status!=200",publisher)
        bootstrap=(ROOT/"oracle"/"original-app-bootstrap.js").read_text(encoding="utf-8")
        self.assertIn('src.replaceAll("/","__")',bootstrap)

    def test_oracle_preview_login_does_not_claim_cantieri_identity(self):
        adapter=(ROOT/"oracle"/"original-app-adapter.js").read_text(encoding="utf-8")
        self.assertIn("Accesso Oracle per Varga Gestionale.",adapter)
        self.assertIn("L'accesso al Gestionale è separato da quello di Varga Cantieri.",adapter)
        self.assertIn("Inserisci le credenziali Oracle assegnate.",adapter)
        self.assertNotIn("stesso account di Varga Cantieri",adapter)

    def test_auth_screen_cannot_remain_on_the_loading_spinner(self):
        adapter=(ROOT/"oracle"/"original-app-adapter.js").read_text(encoding="utf-8")
        self.assertIn('$("loginLoading").hidden=true',adapter)
        self.assertIn("window.VG_ORACLE_UI_READY=true",adapter)
        self.assertIn("window.updateBackupInfo=()=>{}",adapter)
        self.assertIn("window.autoFolderBackup=()=>{}",adapter)
        self.assertIn("restoreSavedSession()",adapter)
        self.assertIn('api.login(email,password,$("loginRemember")?.checked!==false)',adapter)
        client=(ROOT/"oracle"/"client.js").read_text(encoding="utf-8")
        self.assertIn('credentials:"same-origin"',client)
        self.assertNotIn("access_token",client)

if __name__=="__main__":unittest.main()
