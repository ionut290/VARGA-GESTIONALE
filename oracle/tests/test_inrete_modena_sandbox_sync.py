"""Guard the recurring Varga Cantieri to Oracle sandbox import."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "sync_inrete_modena_to_ui_sandbox.sql").read_text(encoding="utf-8")
SCRIPT = (ROOT / "sync_inrete_modena_to_ui_sandbox.sh").read_text(encoding="utf-8")
ALL_SQL = (ROOT / "sync_all_cantieri_to_ui_sandbox.sql").read_text(encoding="utf-8")


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
        self.assertIn("SUM(lavorazioni)", SQL)
        self.assertIn("COUNT(*) FILTER (WHERE tutte_fatte)", SQL)
        self.assertIn("source_snapshot='previous_sync'", SQL)
        self.assertIn("'vcArchived',true,'deleted',true,'operation','delete'", SQL)

    def test_refresh_rotates_complete_snapshot_without_physical_deletes(self):
        refresh = (ROOT / "sync_cantieri_current_to_stage.sh").read_text(encoding="utf-8")
        rotate = refresh.index("SET source_snapshot='previous_sync'")
        upsert = refresh.index("INSERT INTO vg.cantieri_source_stage")
        self.assertLess(rotate, upsert)
        self.assertIn("WHERE source_snapshot='current_sync'", refresh)
        self.assertNotIn("DELETE FROM vg.cantieri_source_stage", refresh.upper())

    def test_syncs_source_before_scoped_import_under_shared_lock(self):
        self.assertIn("flock -x -w 180 /run/lock/varga-cantieri-sync.lock", SCRIPT)
        self.assertIn("oracle/sync_cantieri_cycle.sh", SCRIPT)
        self.assertIn("oracle/sync_inrete_modena_to_ui_sandbox.sql", SCRIPT)

    def test_full_cantieri_projection_runs_in_each_five_minute_cycle(self):
        cycle = (ROOT / "sync_cantieri_cycle.sh").read_text(encoding="utf-8")
        self.assertLess(cycle.index("sync_cantieri_current_to_stage.sh"), cycle.index("map_cantieri_stage_to_workspace.sh"))
        self.assertLess(cycle.index("map_cantieri_stage_to_workspace.sh"), cycle.index("sync_all_cantieri_to_ui_sandbox.sql"))
        self.assertIn("ON_ERROR_STOP=1", cycle)

    def test_all_cantieri_sections_are_synced_and_gestionale_sections_are_outside_scope(self):
        for section in ("jobs", "clients", "vcCommesse", "vcImpianti", "vcOre",
                        "vcSquadre", "vcRecords", "vcUtenti", "vcSegnalazioni"):
            self.assertIn(f"'{section}'", ALL_SQL)
        self.assertIn("gestionale_cantieri_sync_20261027", ALL_SQL)
        self.assertIn("gestionale_varga_ui_sandbox_20261027", ALL_SQL)
        self.assertIn("source_snapshot='current_sync'", ALL_SQL)
        self.assertIn("source_snapshot='previous_sync'", ALL_SQL)
        self.assertIn("cantieri-ui-backup-", ALL_SQL)
        self.assertIn("COALESCE(matched.value,'{}'::jsonb)||fresh.value", ALL_SQL)
        self.assertNotIn("DELETE FROM", ALL_SQL.upper())
        self.assertNotIn("UPDATE PUBLIC.VARGA_SYNC_STATE", ALL_SQL.upper())


if __name__ == "__main__":
    unittest.main()
