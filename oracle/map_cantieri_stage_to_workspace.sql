-- Map current Cantieri staging into a separate, read-only Gestionale workspace.
-- Historical-only paths and all existing candidate data are retained.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('varga-cantieri-sync-workspace-20261027'));

DO $clone$
DECLARE
  source_ws text := 'gestionale_candidate_20261027';
  target_ws text := 'gestionale_cantieri_sync_20261027';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vg.workspaces WHERE id=source_ws) THEN
    RAISE EXCEPTION 'Workspace candidato sorgente non trovato';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vg.workspaces WHERE id=target_ws) THEN
    INSERT INTO vg.workspaces(id,revision,snapshot,updated_at,updated_by)
    SELECT target_ws,revision,snapshot,now(),updated_by
    FROM vg.workspaces WHERE id=source_ws;
    INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_at,updated_by)
    SELECT target_ws,section,revision,data,now(),updated_by
    FROM vg.workspace_sections WHERE workspace_id=source_ws;
    INSERT INTO vg.workspace_members(workspace_id,user_id,can_write)
    SELECT target_ws,user_id,FALSE
    FROM vg.workspace_members WHERE workspace_id=source_ws
    ON CONFLICT(workspace_id,user_id) DO NOTHING;
  END IF;
  IF (SELECT count(*) FROM vg.workspace_sections WHERE workspace_id=target_ws)<7 THEN
    RAISE EXCEPTION 'Workspace sincronizzazione incompleto: stop';
  END IF;
END
$clone$;

CREATE TEMP TABLE cantieri_mapped_incoming(
  section text PRIMARY KEY,
  data jsonb NOT NULL
) ON COMMIT DROP;

WITH src AS (
  SELECT path,collection_name,data,
         split_part(path,'/',array_length(string_to_array(path,'/'),1)) AS doc_id,
         COALESCE(data->>'deleted','false')='true'
           OR COALESCE(data->>'operation','')='delete' AS is_deleted
  FROM vg.cantieri_source_stage
  WHERE source_snapshot='current_sync'
),
raw AS (
  SELECT jsonb_agg(jsonb_build_object(
    'sourcePath',path,'rootCollection',collection_name,'id',doc_id,
    'data',data,'deleted',is_deleted,
    'operation',CASE WHEN is_deleted THEN 'delete' ELSE 'upsert' END,
    'vcArchived',is_deleted,
    'vcDeletedAt',CASE WHEN is_deleted THEN COALESCE(data->>'deletedAt','') ELSE '' END
  ) ORDER BY path) AS data FROM src
),
mapped AS (
  SELECT CASE
    WHEN collection_name='impianti' THEN 'vcImpianti'
    WHEN collection_name='personale' THEN 'vcUtenti'
    WHEN collection_name IN ('oreReports','oreApprovalRequests') THEN 'vcOre'
    WHEN collection_name IN ('squadre','squadreCommesse','squadreStorico') THEN 'vcSquadre'
    WHEN collection_name='commesse' AND array_length(string_to_array(path,'/'),1)=2 THEN 'vcCommesse'
    WHEN collection_name ILIKE '%segnal%' THEN 'vcSegnalazioni'
  END AS section,
  data || jsonb_build_object(
    'id',COALESCE(data->>'id',split_part(path,'/',array_length(string_to_array(path,'/'),1))),
    'vcSourceId',path,'vcRootCollection',collection_name,
    'vcArchived',is_deleted,
    'vcDeletedAt',CASE WHEN is_deleted THEN COALESCE(data->>'deletedAt','') ELSE '' END
  ) AS item,path
  FROM src
  WHERE collection_name IN ('impianti','personale','oreReports','oreApprovalRequests',
                            'squadre','squadreCommesse','squadreStorico','commesse')
     OR collection_name ILIKE '%segnal%'
),
by_section AS (
  SELECT section,jsonb_agg(item ORDER BY path) AS data
  FROM mapped WHERE section IS NOT NULL GROUP BY section
)
INSERT INTO cantieri_mapped_incoming(section,data)
SELECT 'vcRecords',COALESCE(raw.data,'[]'::jsonb) FROM raw
UNION ALL
SELECT section,data FROM by_section;

CREATE OR REPLACE FUNCTION pg_temp.merge_by_source(old_data jsonb,new_data jsonb,key_name text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $merge$
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key),'[]'::jsonb)
  FROM (
    SELECT o.value AS item,o.ordinality*2 AS sort_key
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(old_data)='array' THEN old_data ELSE '[]'::jsonb END)
         WITH ORDINALITY AS o(value,ordinality)
    WHERE COALESCE(o.value->>key_name,o.value->>'sourcePath',o.value->>'sourceId') IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(new_data) n(value)
         WHERE COALESCE(n.value->>key_name,n.value->>'sourcePath',n.value->>'sourceId')
               = COALESCE(o.value->>key_name,o.value->>'sourcePath',o.value->>'sourceId')
       )
    UNION ALL
    SELECT n.value,(1000000000+n.ordinality*2) AS sort_key
    FROM jsonb_array_elements(new_data) WITH ORDINALITY AS n(value,ordinality)
  ) merged
$merge$;

DO $apply$
DECLARE
  target_ws text := 'gestionale_cantieri_sync_20261027';
  item record;
  old_data jsonb;
  new_data jsonb;
  merged jsonb;
  current_revision bigint;
  next_revision bigint;
BEGIN
  FOR item IN SELECT section,data FROM cantieri_mapped_incoming ORDER BY section LOOP
    SELECT data,revision INTO old_data,current_revision
    FROM vg.workspace_sections
    WHERE workspace_id=target_ws AND section=item.section
    FOR UPDATE;
    new_data:=item.data;
    IF old_data IS NULL THEN
      old_data:='[]'::jsonb;
      current_revision:=0;
    END IF;
    merged:=pg_temp.merge_by_source(old_data,new_data,
      CASE WHEN item.section='vcRecords' THEN 'sourcePath' ELSE 'vcSourceId' END);
    IF merged IS DISTINCT FROM old_data THEN
      next_revision:=current_revision+1;
      INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_at,updated_by)
      VALUES(target_ws,item.section,next_revision,merged,now(),NULL)
      ON CONFLICT(workspace_id,section) DO UPDATE SET
        revision=EXCLUDED.revision,data=EXCLUDED.data,updated_at=now(),updated_by=NULL;
      INSERT INTO vg.workspace_section_audit(workspace_id,section,user_id,revision,sha256)
      VALUES(target_ws,item.section,NULL,next_revision,
             encode(digest(merged::text,'sha256'),'hex'))
      ON CONFLICT(workspace_id,section,revision) DO NOTHING;
    END IF;
  END LOOP;
  UPDATE vg.workspaces SET revision=revision+1,updated_at=now()
  WHERE id=target_ws;
END
$apply$;

SELECT 'workspace_sincronizzato' AS controllo,id FROM vg.workspaces
WHERE id='gestionale_cantieri_sync_20261027';
SELECT section,
       CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS elementi,
       revision
FROM vg.workspace_sections
WHERE workspace_id='gestionale_cantieri_sync_20261027'
  AND section IN ('vcCommesse','vcImpianti','vcOre','vcRecords','vcSquadre','vcUtenti','vcSegnalazioni')
ORDER BY section;
COMMIT;
