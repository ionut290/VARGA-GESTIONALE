"""Guard the ORIGINAL GitHub Pages Varga Gestionale interface during Oracle migration.

This is a deliberately strict visual-source freeze of the existing app shell.
Backend/API implementation can evolve, but changing the original page, global
CSS, or layout controllers requires an explicit review of visual parity.
Git blob digests are pinned to the user-approved October 27 GitHub Pages UI.
"""
from pathlib import Path
import hashlib
import unittest

ROOT=Path(__file__).resolve().parents[2]
BASELINE={
    "index.html":"13cb5da53472188580b367a37f74e9089cb7f5eb",
    "style.css":"d379fed22d2414e4887bf5ae56de349f9c694014",
    "view-scenes.js":"0b3e89e194be0f885f759c91badf308263786404",
    "ui-overhaul.js":"ca5fba79950b1d22f3517e4c7cf38e40e4bbf90b",
    "desktop-varga-navigation.js":"7ff864b865c46866f7e451299632da264ec9dc68",
}

def blob_sha(path):
    data=path.read_bytes()
    return hashlib.sha1(("blob "+str(len(data))+"\0").encode()+data).hexdigest()

class OriginalUiParityTest(unittest.TestCase):
    def test_original_interface_files_unchanged(self):
        for relative,expected in BASELINE.items():
            with self.subTest(file=relative):
                self.assertEqual(blob_sha(ROOT/relative),expected,
                    "Interfaccia originale cambiata: verificare esplicitamente "
                    "la parità grafica con GitHub Pages prima di aggiornare il baseline.")

    def test_new_oracle_console_is_not_the_original_interface(self):
        index=(ROOT/"index.html").read_text(encoding="utf-8")
        self.assertNotIn("oracle/console.html",index)
        self.assertNotIn("oracle/console.js",index)
        self.assertIn("app.js",index)
        self.assertIn("style.css",index)

if __name__=="__main__":
    unittest.main()
