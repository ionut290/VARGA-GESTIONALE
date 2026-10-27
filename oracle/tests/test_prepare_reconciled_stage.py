"""Regression tests for non-destructive Oracle staging reconciliation."""
import importlib.util
from pathlib import Path
import unittest

HERE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("prepare_reconciled_stage",HERE/"prepare_reconciled_stage.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ReconciledTest(unittest.TestCase):
    def fixtures(self):
        old={"app":"Varga Gestionale","createdAt":"2026-10-19T12:00:00Z",
             "data":{"clients":[{"id":"c1","name":"old"}],
                     "vcRecords":[{"sourcePath":"x1","stato":"a"},{"sourcePath":"x2","stato":"old"}],
                     "vcSquadre":[{"id":"s1"}],
                     "dismissedRequestReceiptIds":["a","b"],
                     "meta":{"source":"old"}}}
        fresh={"app":"Varga Gestionale","workspace":"varga-azienda",
               "source_mode":"incremental-v3","exported_at":"2026-10-27T05:31:38Z",
               "data":{"clients":[{"id":"c1","name":"new"},{"id":"c2"}],
                       "company":{"name":"current"}}}
        fresh["local_browser_archive"]={
          "clients":[{"id":"c1","name":"new"},{"id":"c2"}],
          "company":{"name":"current"},
          "vcRecords":[{"sourcePath":"x1","stato":"b"},{"sourcePath":"x3","stato":"fresh"}],
          "vcSquadre":[{"id":"s2"}],
          "dismissedRequestReceiptIds":["a"],
          "meta":{"source":"new"},
          "priceCatalog":{"items":[]}}
        return old,fresh

    def test_latest_data_preserved_historical_only_quarantined(self):
        old,fresh=self.fixtures()
        sections,conflicts,absent=mod.build(old,fresh)
        self.assertEqual(sections["clients"][0]["name"],"new")
        self.assertEqual(len(sections["clients"]),2)
        self.assertEqual(len(sections["vcRecords"]),2)
        self.assertEqual(sections["vcRecords"][1]["sourcePath"],"x3")
        review=sections["migrationReview"]["historicalOnly"]
        self.assertEqual(review["vcRecords"]["records"][0]["sourcePath"],"x2")
        self.assertEqual(review["vcSquadre"]["records"][0]["id"],"s1")
        self.assertEqual(review["dismissedRequestReceiptIds"]["records"],["b"])
        self.assertEqual(conflicts, {})
        self.assertEqual(absent["vcRecords"],1)
        self.assertIn("priceCatalog",sections)
        self.assertEqual(len(sections["migrationReview"]["historicalSectionAbsent"]),0)

    def test_browser_cloud_conflict_stays_in_review(self):
        old,fresh=self.fixtures()
        fresh["local_browser_archive"]["company"]={"name":"different browser"}
        sections,conflicts,_=mod.build(old,fresh)
        self.assertEqual(sections["company"]["name"],"current")
        self.assertEqual(sections["migrationReview"]["cloudBrowserConflict"]["company"]["browserCopy"]["name"],
                         "different browser")
        self.assertEqual(conflicts["company"],1)

    def test_unavailable_historical_section_preserved(self):
        old,fresh=self.fixtures()
        del fresh["local_browser_archive"]["vcSquadre"]
        sections,_,_=mod.build(old,fresh)
        self.assertNotIn("vcSquadre",sections)
        self.assertEqual(sections["migrationReview"]["historicalSectionAbsent"]["vcSquadre"],[{"id":"s1"}])

    def test_earliest_missing_rows_quarantined_without_resurrection(self):
        old,fresh=self.fixtures()
        sections,_,_=mod.build(old,fresh)
        earliest={"app":"Varga Gestionale",
                  "createdAt":"2026-10-15T16:00:00Z",
                  "data":{"vcRecords":[{"sourcePath":"x0","stato":"very-old"},
                                       {"sourcePath":"x2","stato":"also-old"}],
                          "clients":[{"id":"c1"},{"id":"only-15"}],
                          "requests":[{"id":"r1"}]}}
        extra=mod.add_earliest_historical(sections,earliest)
        self.assertEqual(extra["vcRecords"],1)
        self.assertEqual(extra["clients"],1)
        self.assertEqual(extra["requests"],1)
        quarantine=sections["migrationReview"]["historicalOnly"]
        self.assertEqual({r["sourcePath"] for r in quarantine["vcRecords"]["records"]},
                         {"x0","x2"})
        self.assertNotIn("requests",sections)
        self.assertEqual(sections["migrationReview"]["historicalSectionAbsent"]["requests"],
                         [{"id":"r1"}])
        self.assertEqual(len(sections["clients"]),2)

    def test_never_import_different_workspace(self):
        old,fresh=self.fixtures()
        fresh["workspace"]="other"
        with self.assertRaises(ValueError):
            mod.build(old,fresh)

if __name__=="__main__":
    unittest.main()
