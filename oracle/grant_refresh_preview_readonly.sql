-- Grant refreshed historical preview to existing, authorized sandbox users ONLY.
-- This does not enable writing or create accounts.
BEGIN;
DO $guard$
BEGIN
 IF (SELECT count(*) FROM vg.workspace_sections WHERE workspace_id='gestionale_backup_20261027_refresh')<>30 THEN
  RAISE EXCEPTION 'Refresh non verificato: nessuna autorizzazione concessa';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM vg.workspace_members WHERE workspace_id='gestionale_sandbox_20261027') THEN
  RAISE EXCEPTION 'Nessun utente Oracle già autorizzato al laboratorio';
 END IF;
END
$guard$;
INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
SELECT 'gestionale_backup_20261027_refresh',m.user_id,FALSE
FROM vg.workspace_members m
JOIN vg.users u ON u.id=m.user_id
WHERE m.workspace_id='gestionale_sandbox_20261027' AND u.active=TRUE
ON CONFLICT (workspace_id,user_id) DO UPDATE SET can_write=FALSE;
SELECT COUNT(*) AS account_abilitati_sola_lettura
FROM vg.workspace_members
WHERE workspace_id='gestionale_backup_20261027_refresh' AND can_write=FALSE;
COMMIT;
