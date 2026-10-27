-- Crea un workspace di prova scrivibile copiando lo staging Oracle.
-- La sorgente resta immutata; nessun collegamento Firebase/Firestore viene usato.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('varga-original-ui-sandbox-20261027'));

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vg.workspaces WHERE id='gestionale_cantieri_sync_20261027'
  ) THEN
    RAISE EXCEPTION 'Workspace sorgente di staging non trovato';
  END IF;
  IF (SELECT count(*) FROM vg.workspace_sections
      WHERE workspace_id='gestionale_cantieri_sync_20261027')=0 THEN
    RAISE EXCEPTION 'Workspace sorgente senza sezioni';
  END IF;
  IF EXISTS (
    SELECT 1 FROM vg.workspaces WHERE id='gestionale_varga_ui_sandbox_20261027'
  ) OR EXISTS (
    SELECT 1 FROM vg.workspace_sections
    WHERE workspace_id='gestionale_varga_ui_sandbox_20261027'
  ) OR EXISTS (
    SELECT 1 FROM vg.workspace_members
    WHERE workspace_id='gestionale_varga_ui_sandbox_20261027'
  ) THEN
    RAISE EXCEPTION 'Workspace prova già esistente: nessuna sovrascrittura';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.workspace_members m
    JOIN vg.users u ON u.id=m.user_id
    WHERE m.workspace_id='gestionale_cantieri_sync_20261027'
      AND u.active=true AND u.role='admin'
  ) THEN
    RAISE EXCEPTION 'Nessun amministratore attivo autorizzato nella sorgente';
  END IF;
END
$checks$;

INSERT INTO vg.workspaces(id,revision,snapshot,updated_at,updated_by)
SELECT 'gestionale_varga_ui_sandbox_20261027',revision,snapshot,now(),updated_by
FROM vg.workspaces WHERE id='gestionale_cantieri_sync_20261027';

INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_at,updated_by)
SELECT 'gestionale_varga_ui_sandbox_20261027',section,revision,data,now(),updated_by
FROM vg.workspace_sections
WHERE workspace_id='gestionale_cantieri_sync_20261027';

-- Only active members are copied. Existing admins can write to this sandbox;
-- all other roles remain read-only. Source memberships are never changed.
INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
SELECT 'gestionale_varga_ui_sandbox_20261027',m.user_id,(u.role='admin')
FROM vg.workspace_members m
JOIN vg.users u ON u.id=m.user_id
WHERE m.workspace_id='gestionale_cantieri_sync_20261027' AND u.active=true;

DO $verify$
BEGIN
  IF EXISTS (
    (SELECT section,revision,data FROM vg.workspace_sections
     WHERE workspace_id='gestionale_cantieri_sync_20261027'
     EXCEPT
     SELECT section,revision,data FROM vg.workspace_sections
     WHERE workspace_id='gestionale_varga_ui_sandbox_20261027')
    UNION ALL
    (SELECT section,revision,data FROM vg.workspace_sections
     WHERE workspace_id='gestionale_varga_ui_sandbox_20261027'
     EXCEPT
     SELECT section,revision,data FROM vg.workspace_sections
     WHERE workspace_id='gestionale_cantieri_sync_20261027')
  ) THEN
    RAISE EXCEPTION 'Confronto sezioni sorgente/copia fallito: rollback';
  END IF;
  IF (SELECT count(*) FROM vg.workspace_sections
      WHERE workspace_id='gestionale_varga_ui_sandbox_20261027') <>
     (SELECT count(*) FROM vg.workspace_sections
      WHERE workspace_id='gestionale_cantieri_sync_20261027') THEN
    RAISE EXCEPTION 'Numero sezioni non corrispondente: rollback';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.workspace_members m
    JOIN vg.users u ON u.id=m.user_id
    WHERE m.workspace_id='gestionale_varga_ui_sandbox_20261027'
      AND m.can_write=true AND u.role='admin' AND u.active=true
  ) THEN
    RAISE EXCEPTION 'Nessun amministratore scrivibile nella copia: rollback';
  END IF;
  IF EXISTS (
    SELECT 1 FROM vg.workspace_members m JOIN vg.users u ON u.id=m.user_id
    WHERE m.workspace_id='gestionale_varga_ui_sandbox_20261027'
      AND m.can_write=true AND u.role<>'admin'
  ) THEN
    RAISE EXCEPTION 'Ruolo non amministratore con scrittura: rollback';
  END IF;
END
$verify$;
COMMIT;

SELECT section,revision,
       CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) END AS records
FROM vg.workspace_sections
WHERE workspace_id='gestionale_varga_ui_sandbox_20261027'
ORDER BY section;
