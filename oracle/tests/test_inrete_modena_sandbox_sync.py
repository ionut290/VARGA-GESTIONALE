"""Guard the one-commessa Oracle sandbox import against scope expansion."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "sync_inrete_modena_to_ui_sandbox.sql").read_text(encoding="utf-8")
SCRIPT = (ROOT / "sync_inrete_modena_to_ui_sandbox.sh").read_text(encoding="utf-8")


class InreteModenaSandboxSyncTest(unittest.TestCase):
    def test_reads_current_sync_and_writes_only_ui_sandbox(self):
        self.assertIn("source_snapshot='current_sync'", SQL)
        self.assertIn("gestionale_cantieri_sync_20261027", SQL)
        self.assertIn("gestionale_varga_ui_sandbox_20261027", SQL)
        self.assertIn("'inretemodena'", SQL)
        self.assertIn("'28015'", SQL)
        self.assertNotIn("UPDATE public.varga_sync_state", SQL)
        self.assertNotIn("DELETE FROM", SQL.upper())

    def test_preserves_unrelated_rows_and_saves_private_rollback_copy(self):
        self.assertIn("inrete-modena-backup-", SQL)
        self.assertIn("NOT EXISTS (", SQL)
        self.assertIn("section IN ('jobs','clients','vcCommesse','vcImpianti','vcOre','vcSquadre','vcRecords')", SQL)

    def test_syncs_source_before_scoped_import_under_shared_lock(self):
        self.assertIn("flock -x -w 180 /run/lock/varga-cantieri-sync.lock", SCRIPT)
        self.assertIn("oracle/sync_cantieri_cycle.sh", SCRIPT)
        self.assertIn("oracle/sync_inrete_modena_to_ui_sandbox.sql", SCRIPT)


if __name__ == "__main__":
    unittest.main()
