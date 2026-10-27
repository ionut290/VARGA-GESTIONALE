-- Grant candidate preview read access only to existing authorized Oracle users.
-- No business rows changed; no write privileges added.
BEGIN;
DO $guard$
BEGIN
 IF (SELECT count(*) FROM vg.workspace_sections
     WHERE workspace_id='gestionale_candidate_20261027')<>30 THEN
   RAISE EXCEPTION 'Candidate incompleta: permessi non concessi';
 END IF;
 IF EXISTS (
  (SELECT section,data FROM vg.workspace_sections
   WHERE workspace_id='gestionale_backup_20261027_refresh'
   EXCEPT SELECT section,data FROM vg.workspace_sections
   WHERE workspace_id='gestionale_candidate_20261027')
  UNION ALL
  (SELECT section,data FROM vg.workspace_sections
   WHERE workspace_id='gestionale_candidate_20261027'
   EXCEPT SELECT section,data FROM vg.workspace_sections
   WHERE workspace_id='gestionale_backup_20261027_refresh')
 ) THEN RAISE EXCEPTION 'Candidate differente dalla fotografia verificata'; END IF;
END $guard$;
INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
SELECT 'gestionale_candidate_20261027',m.user_id,FALSE
FROM vg.workspace_members m JOIN vg.users u ON u.id=m.user_id
WHERE m.workspace_id='gestionale_backup_20261027_refresh' AND u.active=TRUE
ON CONFLICT (workspace_id,user_id) DO UPDATE SET can_write=FALSE;
COMMIT;
SELECT count(*) AS utenti_sola_lettura FROM vg.workspace_members
WHERE workspace_id='gestionale_candidate_20261027' AND can_write=FALSE;
