-- Add missing synthetic modules only. Existing real and demo records are unchanged.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('vg-gestionale-oracle-sandbox-20261027'));
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM vg.workspaces WHERE id='gestionale_sandbox_20261027') THEN
  RAISE EXCEPTION 'Sandbox Oracle DEMO assente';
 END IF;
 IF (SELECT count(*) FROM vg.workspace_sections
     WHERE workspace_id='gestionale_sandbox_20261027'
       AND section IN ('clients','jobs','quotes','consuntivi','invoices','priceLists','entries'))<>7 THEN
  RAISE EXCEPTION 'Le sette sezioni DEMO originali non sono disponibili';
 END IF;
END
$guard$;
INSERT INTO vg.workspace_sections(workspace_id,section,revision,data)
VALUES
('gestionale_sandbox_20261027','expenses',1,'[]'::jsonb),
('gestionale_sandbox_20261027','deadlines',1,'[]'::jsonb),
('gestionale_sandbox_20261027','documents',1,'[]'::jsonb),
('gestionale_sandbox_20261027','requests',1,'[]'::jsonb),
('gestionale_sandbox_20261027','vcCommesse',1,'[]'::jsonb),
('gestionale_sandbox_20261027','vcImpianti',1,'[]'::jsonb),
('gestionale_sandbox_20261027','vcOre',1,'[]'::jsonb),
('gestionale_sandbox_20261027','vcRecords',1,'[]'::jsonb),
('gestionale_sandbox_20261027','company',1,'{}'::jsonb)
ON CONFLICT (workspace_id,section) DO NOTHING;
DO $check$
BEGIN
 IF (SELECT count(*) FROM vg.workspace_sections
    WHERE workspace_id='gestionale_sandbox_20261027')<>16 THEN
   RAISE EXCEPTION 'Schema DEMO inatteso: revisione manuale richiesta';
 END IF;
END
$check$;
COMMIT;
SELECT section,revision,jsonb_typeof(data) AS data_type
FROM vg.workspace_sections WHERE workspace_id='gestionale_sandbox_20261027'
ORDER BY section;
