-- DEMO-only additional sections. Execute manually only after reviewing CI.
-- Add missing isolated sections; never alter existing rows or real workspaces.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('vg-gestionale-oracle-sandbox-20261027'));
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM vg.workspaces WHERE id='gestionale_sandbox_20261027') THEN
  RAISE EXCEPTION 'Sandbox DEMO mancante';
 END IF;
 IF (SELECT count(*) FROM vg.workspace_members WHERE workspace_id='gestionale_sandbox_20261027' AND can_write)=0 THEN
  RAISE EXCEPTION 'Permessi DEMO non configurati';
 END IF;
 IF (SELECT count(*) FROM vg.workspace_sections WHERE workspace_id='gestionale_sandbox_20261027' AND section IN ('clients','jobs','quotes','consuntivi'))<4 THEN
  RAISE EXCEPTION 'Sezioni DEMO originali mancanti';
 END IF;
END
$guard$;
INSERT INTO vg.workspace_sections(workspace_id,section,revision,data)
VALUES
 ('gestionale_sandbox_20261027','invoices',1,'[]'::jsonb),
 ('gestionale_sandbox_20261027','priceLists',1,'[]'::jsonb),
 ('gestionale_sandbox_20261027','entries',1,'[]'::jsonb)
ON CONFLICT (workspace_id,section) DO NOTHING;
DO $verify$
BEGIN
 IF EXISTS (
  SELECT 1 FROM vg.workspace_sections
  WHERE workspace_id='gestionale_sandbox_20261027'
    AND section IN ('invoices','priceLists','entries')
    AND jsonb_typeof(data)<>'array'
 ) THEN
  RAISE EXCEPTION 'Formato della sezione DEMO inatteso';
 END IF;
 IF (SELECT count(*) FROM vg.workspace_sections
     WHERE workspace_id='gestionale_sandbox_20261027'
     AND section IN ('invoices','priceLists','entries'))<>3 THEN
  RAISE EXCEPTION 'Sezioni DEMO non presenti';
 END IF;
END
$verify$;
COMMIT;
SELECT section,revision,jsonb_array_length(data) AS records
FROM vg.workspace_sections
WHERE workspace_id='gestionale_sandbox_20261027'
AND section IN ('invoices','priceLists','entries')
ORDER BY section;
