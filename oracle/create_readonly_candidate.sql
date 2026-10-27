-- One-time internal copy for future Oracle-only cutover development.
-- Source: verified immutable refreshed export; target: isolated candidate, READ ONLY.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('varga-gestionale-candidate-20261027'));
DO $checks$
BEGIN
 IF (SELECT count(*) FROM vg.workspace_sections
      WHERE workspace_id='gestionale_backup_20261027_refresh')<>30 THEN
   RAISE EXCEPTION 'Refresh sorgente non completo';
 END IF;
 IF EXISTS (SELECT 1 FROM vg.workspace_sections
      WHERE workspace_id='gestionale_candidate_20261027')
    OR EXISTS (SELECT 1 FROM vg.workspaces
      WHERE id='gestionale_candidate_20261027') THEN
   RAISE EXCEPTION 'Candidate già esistente: non sovrascrivo';
 END IF;
END
$checks$;
INSERT INTO vg.workspaces(id,revision,snapshot)
VALUES ('gestionale_candidate_20261027',0,'{}'::jsonb);
INSERT INTO vg.workspace_sections(workspace_id,section,revision,data)
SELECT 'gestionale_candidate_20261027',section,1,data
FROM vg.workspace_sections
WHERE workspace_id='gestionale_backup_20261027_refresh';
DO $verify$
BEGIN
 IF EXISTS (
   (SELECT section,data FROM vg.workspace_sections
      WHERE workspace_id='gestionale_backup_20261027_refresh'
    EXCEPT
    SELECT section,data FROM vg.workspace_sections
      WHERE workspace_id='gestionale_candidate_20261027')
   UNION ALL
   (SELECT section,data FROM vg.workspace_sections
      WHERE workspace_id='gestionale_candidate_20261027'
    EXCEPT
    SELECT section,data FROM vg.workspace_sections
      WHERE workspace_id='gestionale_backup_20261027_refresh')
 ) THEN
   RAISE EXCEPTION 'Verifica contenuti fallita: rollback';
 END IF;
END
$verify$;
INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
SELECT 'gestionale_candidate_20261027',m.user_id,FALSE
FROM vg.workspace_members m JOIN vg.users u ON u.id=m.user_id
WHERE m.workspace_id='gestionale_backup_20261027_refresh' AND u.active=TRUE
ON CONFLICT (workspace_id,user_id) DO NOTHING;
COMMIT;
SELECT count(*) AS sezioni_candidate FROM vg.workspace_sections
WHERE workspace_id='gestionale_candidate_20261027';
