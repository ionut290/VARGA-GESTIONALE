"""Guard the isolated Cantieri projection from lost Firestore fields or deletes."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
SQL=(ROOT/"oracle"/"map_cantieri_stage_to_workspace.sql").read_text(encoding="utf-8")

class CantieriWorkspaceMappingTest(unittest.TestCase):
    def test_firestore_envelopes_are_decoded_before_projection(self):
        decoder=SQL.index("FUNCTION pg_temp.unwrap_firestore")
        source=SQL.index("pg_temp.unwrap_firestore(data) AS data")
        self.assertLess(decoder,source)
        for tag in ("'map'", "'array'", "'null'", "'boolean'", "'number'", "'string'", "'timestamp'"):
            self.assertIn(tag,SQL[decoder:source])

    def test_business_sections_receive_root_commesse(self):
        self.assertIn("collection_name='commesse'",SQL)
        self.assertIn("INSERT INTO cantieri_mapped_incoming(section,data)",SQL)
        self.assertIn("SELECT 'jobs'",SQL)
        self.assertIn("SELECT 'clients'",SQL)
        self.assertIn("pg_temp.merge_business_patch",SQL)
        self.assertIn("'gestionale_cantieri_sync_20261027'",SQL)

    def test_merge_is_additive_and_does_not_touch_candidate_workspace(self):
        upper=SQL.upper()
        apply=upper.split("DO $APPLY$",1)[1]
        self.assertIn("UNION ALL",upper)
        self.assertIn("WHERE NOT EXISTS",upper)
        self.assertNotIn("DELETE FROM VG.WORKSPACE_SECTIONS",upper)
        self.assertNotIn("DELETE FROM VG.WORKSPACES",upper)
        self.assertIn("INSERT INTO VG.WORKSPACE_SECTIONS(WORKSPACE_ID,SECTION",apply)
        self.assertIn("VALUES(TARGET_WS,ITEM.SECTION",apply)
        self.assertNotIn("GESTIONALE_CANDIDATE_20261027",apply)

if __name__=="__main__":
    unittest.main()
