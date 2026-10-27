"""Guard Oracle preview navigation and read-only coverage of original sections."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[2]

class OriginalPreviewCoverage(unittest.TestCase):
    def test_every_original_menu_view_has_an_explicit_route(self):
        html=(ROOT/"index.html").read_text(encoding="utf-8")
        js=(ROOT/"oracle"/"original-preview.js").read_text(encoding="utf-8")
        views=set(re.findall(r'class="nav[^\"]*" data-view="([^"]+)"',html))
        routes=re.search(r'const routes=\{([\s\S]*?)\n  \};',js).group(1)
        mapped=set(re.findall(r'([A-Za-z][A-Za-z0-9]*):\[',routes))
        self.assertEqual(views,mapped)

    def test_oracle_preview_reads_hours_teams_reports_and_accounting_sections(self):
        js=(ROOT/"oracle"/"original-preview.js").read_text(encoding="utf-8")
        for section in ("vcOre","vcSquadre","rapportini","consuntivi",
                        "depurazioneConsuntivi","discaricheConsuntivi",
                        "wteModenaConsuntivi","economicEntries","priceCatalog",
                        "cadrianoDocuments"):
            with self.subTest(section=section):
                self.assertIn(section,js)
        self.assertIn("api.readSection(ROOT,key)",js)

    def test_preview_cannot_write_or_load_firebase(self):
        js=(ROOT/"oracle"/"original-preview.js").read_text(encoding="utf-8")
        self.assertNotIn("api.saveSection(",js)
        self.assertNotIn("api.save(",js)
        self.assertNotIn("firebase.",js)
        self.assertIn('const ROOT="gestionale_cantieri_sync_20261027";',js)

if __name__=="__main__":
    unittest.main()
