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

    def test_cantieri_record_explorer_is_read_only_and_searchable(self):
        js=(ROOT/"oracle"/"original-preview.js").read_text(encoding="utf-8")
        for collection in ("vcCommesse","vcImpianti","vcOre","rapportini",
                           "vcSquadre","vcUtenti","vcSegnalazioni","vcRecords"):
            with self.subTest(collection=collection):
                self.assertIn('["'+collection+'"',js)
        self.assertIn('id="vcRecordSearch"',js)
        self.assertIn('id="vcRecordResults"',js)
        self.assertIn("body.textContent=",js)
        self.assertIn("model.cache.get(key)",js)
        self.assertIn('event.target.closest("#vcRecordExplorer")',js)

    def test_commesse_preview_reuses_original_package_layout_without_firebase(self):
        js=(ROOT/"oracle"/"original-preview.js").read_text(encoding="utf-8")
        ui=(ROOT/"oracle"/"original-preview-ui.js").read_text(encoding="utf-8")
        for label in ("DISCARICHE","INRETE","VARIE","COMUNE BOLOGNA",
                      "SITUAZIONE IMPIANTI","NUOVA COMMESSA"):
            with self.subTest(label=label):
                self.assertIn(label,js)
        self.assertIn("renderCommesseRecords();",js)
        self.assertIn(".vg-job-grid",ui)
        self.assertIn("@media(min-width:1500px)",ui)
        self.assertIn("repeat(4,minmax(250px,1fr))",ui)
        self.assertIn("function showReadonlyJob(job)",js)
        self.assertNotIn('src="/job-workspace.js"',
                         (ROOT/"oracle"/"original-preview.html").read_text(encoding="utf-8"))

if __name__=="__main__":
    unittest.main()
