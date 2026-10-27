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

-- Current sync-state rows may contain Firestore's tagged {t,v} value format.
-- Decode the standard scalar/map/array tags before the app-shaped projection;
-- unknown or malformed tags stay wrapped so they remain visible for review.
CREATE OR REPLACE FUNCTION pg_temp.unwrap_firestore(value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $unwrap$
DECLARE
  tag text;
  inner_value jsonb;
  result jsonb;
BEGIN
  IF jsonb_typeof(value)='array' THEN
    SELECT COALESCE(jsonb_agg(pg_temp.unwrap_firestore(item) ORDER BY ordinality),'[]'::jsonb)
      INTO result
    FROM jsonb_array_elements(value) WITH ORDINALITY AS rows(item,ordinality);
    RETURN result;
  ELSIF jsonb_typeof(value)='object' THEN
    IF (value-'t'-'v')='{}'::jsonb
       AND value ? 't' AND value ? 'v'
       AND jsonb_typeof(value->'t')='string' THEN
      tag:=value->>'t';
      inner_value:=value->'v';
      IF tag='map' AND jsonb_typeof(inner_value)='object' THEN
        RETURN pg_temp.unwrap_firestore(inner_value);
      ELSIF tag='array' AND jsonb_typeof(inner_value)='array' THEN
        RETURN pg_temp.unwrap_firestore(inner_value);
      ELSIF tag='null' THEN
        RETURN 'null'::jsonb;
      ELSIF tag='boolean' AND jsonb_typeof(inner_value)='boolean' THEN
        RETURN inner_value;
      ELSIF tag='number' AND jsonb_typeof(inner_value)='number' THEN
        RETURN inner_value;
      ELSIF tag IN ('string','timestamp') AND jsonb_typeof(inner_value)='string' THEN
        RETURN inner_value;
      ELSE
        RETURN jsonb_build_object('t',tag,'v',pg_temp.unwrap_firestore(inner_value));
      END IF;
    END IF;
    SELECT COALESCE(jsonb_object_agg(key,pg_temp.unwrap_firestore(item)),'{}'::jsonb)
      INTO result
    FROM jsonb_each(value) AS rows(key,item);
    RETURN result;
  END IF;
  RETURN value;
END
$unwrap$;

CREATE OR REPLACE FUNCTION pg_temp.vc_number(value text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $number$
DECLARE
  cleaned text;
BEGIN
  cleaned:=regexp_replace(COALESCE(value,''),'[^0-9,.-]','','g');
  IF cleaned ~ '^-?[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?$' THEN
    RETURN replace(replace(cleaned,'.',''),',','.')::numeric;
  ELSIF cleaned ~ '^-?[0-9]+,[0-9]+$' THEN
    RETURN replace(cleaned,',','.')::numeric;
  ELSIF cleaned ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RETURN cleaned::numeric;
  END IF;
  RETURN 0;
END
$number$;

WITH src AS (
  SELECT path,collection_name,pg_temp.unwrap_firestore(data) AS data,
         split_part(path,'/',array_length(string_to_array(path,'/'),1)) AS doc_id,
         COALESCE(pg_temp.unwrap_firestore(data)->>'deleted','false')='true'
           OR COALESCE(pg_temp.unwrap_firestore(data)->>'operation','')='delete' AS is_deleted
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
  (CASE WHEN jsonb_typeof(data)='object' THEN data ELSE jsonb_build_object('value',data) END) || jsonb_build_object(
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

-- Project root Cantieri work orders into the Gestionale business sections too.
-- This follows app-sync.js: each root commessa becomes a job and an associated
-- client, while every original record remains preserved in vcRecords/vcCommesse.
CREATE TEMP TABLE cantieri_commessa_business (
  source_path text PRIMARY KEY,
  document_id text NOT NULL,
  source_data jsonb NOT NULL,
  is_deleted boolean NOT NULL,
  job_id text NOT NULL,
  client_id text NOT NULL,
  client_exists boolean NOT NULL,
  title text NOT NULL
) ON COMMIT DROP;

WITH roots AS (
  SELECT path,
         split_part(path,'/',array_length(string_to_array(path,'/'),1)) AS document_id,
         pg_temp.unwrap_firestore(data) AS data,
         COALESCE(pg_temp.unwrap_firestore(data)->>'deleted','false')='true'
           OR COALESCE(pg_temp.unwrap_firestore(data)->>'operation','')='delete' AS is_deleted,
         COALESCE(NULLIF(pg_temp.unwrap_firestore(data)->>'title',''),NULLIF(pg_temp.unwrap_firestore(data)->>'name',''),
                  NULLIF(pg_temp.unwrap_firestore(data)->>'nome',''),
                  NULLIF(pg_temp.unwrap_firestore(data)->>'commessa',''),
                  'Commessa Varga Cantieri') AS title
  FROM vg.cantieri_source_stage
  WHERE source_snapshot='current_sync'
    AND collection_name='commesse'
    AND array_length(string_to_array(path,'/'),1)=2
),
matched AS (
  SELECT r.*,
         j.value AS existing_job,
         c.value AS existing_client
  FROM roots r
  LEFT JOIN LATERAL (
    SELECT e.value FROM vg.workspace_sections ws,
         LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ws.data)='array'
                                           THEN ws.data ELSE '[]'::jsonb END) e(value)
    WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
      AND ws.section='jobs'
      AND (e.value->>'vcSourceId'=r.path OR e.value->>'sourceId'=r.document_id)
    ORDER BY CASE WHEN e.value->>'vcSourceId'=r.path THEN 0 ELSE 1 END
    LIMIT 1
  ) j ON true
  LEFT JOIN LATERAL (
    SELECT e.value FROM vg.workspace_sections ws,
         LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ws.data)='array'
                                           THEN ws.data ELSE '[]'::jsonb END) e(value)
    WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
      AND ws.section='clients'
      AND (e.value->>'vcCommessaSourceId'=r.path
           OR lower(btrim(COALESCE(e.value->>'name','')))=lower(btrim(r.title)))
    ORDER BY CASE WHEN e.value->>'vcCommessaSourceId'=r.path THEN 0 ELSE 1 END
    LIMIT 1
  ) c ON true
)
INSERT INTO cantieri_commessa_business(
  source_path,document_id,source_data,is_deleted,job_id,client_id,client_exists,title
)
SELECT path,document_id,data,is_deleted,
       COALESCE(existing_job->>'id','vc-job-'||md5(path)),
       COALESCE(existing_client->>'id','vc-client-'||md5(lower(btrim(title)))),
       existing_client IS NOT NULL,title
FROM matched;

INSERT INTO cantieri_mapped_incoming(section,data)
SELECT 'jobs',COALESCE(jsonb_agg(
  CASE WHEN is_deleted THEN
    jsonb_build_object('id',job_id,'vcSourceId',source_path,
                       'sourceId',document_id,'vcArchived',true)
  ELSE jsonb_strip_nulls(jsonb_build_object(
    'id',job_id,'title',title,
    'code',COALESCE(NULLIF(source_data->>'code',''),NULLIF(source_data->>'codice',''),
                    source_data->>'codiceCommessa',''),
    'clientId',client_id,
    'site',COALESCE(NULLIF(source_data->>'site',''),NULLIF(source_data->>'cantiere',''),
                     source_data->>'comune',''),
    'start',COALESCE(NULLIF(source_data->>'start',''),source_data->>'dataInizio',''),
    'end',COALESCE(NULLIF(source_data->>'end',''),source_data->>'dataFine',''),
    'value',pg_temp.vc_number(COALESCE(source_data->>'value',source_data->>'importo','')),
    'status',COALESCE(NULLIF(source_data->>'status',''),source_data->>'stato','Attiva'),
    'source','Varga Cantieri','sourceId',document_id,'vcSourceId',source_path
  )) END ORDER BY source_path
),'[]'::jsonb)
FROM cantieri_commessa_business
UNION ALL
SELECT 'clients',COALESCE(jsonb_agg(
  CASE WHEN client_exists THEN
    jsonb_build_object('id',client_id,'name',title,
                       'vcCommessaSourceId',source_path)
  ELSE jsonb_build_object(
    'id',client_id,'name',title,'vat','','address','',
    'city',COALESCE(source_data->>'comune',''),'email','','phone','',
    'priceListId','',
    'notes','Cliente creato automaticamente dalla commessa Varga Cantieri.',
    'vcCommessaSourceId',source_path,'source','Varga Cantieri'
  ) END ORDER BY source_path
),'[]'::jsonb)
FROM (
  SELECT DISTINCT ON (client_id) client_id,title,client_exists,source_data,source_path
  FROM cantieri_commessa_business
  WHERE NOT is_deleted
  ORDER BY client_id,source_path DESC
) client_rows
ON CONFLICT(section) DO UPDATE SET data=EXCLUDED.data;

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

CREATE OR REPLACE FUNCTION pg_temp.merge_business_patch(old_data jsonb,new_data jsonb,key_name text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $patch$
  SELECT COALESCE(jsonb_agg(item ORDER BY sort_key),'[]'::jsonb)
  FROM (
    SELECT COALESCE(o.value,'{}'::jsonb)||n.value AS item,
           1000000000+n.ordinality AS sort_key
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(new_data)='array'
                                    THEN new_data ELSE '[]'::jsonb END)
         WITH ORDINALITY AS n(value,ordinality)
    LEFT JOIN LATERAL (
      SELECT old.value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(old_data)='array' THEN old_data ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS old(value,ordinality)
      WHERE (n.value->>'id' IS NOT NULL AND old.value->>'id'=n.value->>'id')
         OR (n.value->>key_name IS NOT NULL
             AND old.value->>key_name=n.value->>key_name)
         OR (n.value->>'sourceId' IS NOT NULL
             AND old.value->>'sourceId'=n.value->>'sourceId')
      ORDER BY old.ordinality LIMIT 1
    ) o ON true
    UNION ALL
    SELECT old.value AS item,old.ordinality AS sort_key
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(old_data)='array'
                                   THEN old_data ELSE '[]'::jsonb END)
         WITH ORDINALITY AS old(value,ordinality)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(new_data)='array'
                                              THEN new_data ELSE '[]'::jsonb END) n(value)
      WHERE (n.value->>'id' IS NOT NULL AND old.value->>'id'=n.value->>'id')
         OR (n.value->>key_name IS NOT NULL
             AND old.value->>key_name=n.value->>key_name)
         OR (n.value->>'sourceId' IS NOT NULL
             AND old.value->>'sourceId'=n.value->>'sourceId')
    )
  ) merged
$patch$;

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
    IF item.section IN ('jobs','clients') THEN
      merged:=pg_temp.merge_business_patch(old_data,new_data,
        CASE WHEN item.section='jobs' THEN 'vcSourceId' ELSE 'vcCommessaSourceId' END);
    ELSE
      merged:=pg_temp.merge_by_source(old_data,new_data,
        CASE WHEN item.section='vcRecords' THEN 'sourcePath' ELSE 'vcSourceId' END);
    END IF;
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
SELECT section,
       CASE WHEN jsonb_typeof(data)='array' THEN jsonb_array_length(data) ELSE NULL END AS elementi,
       revision
FROM vg.workspace_sections
WHERE workspace_id='gestionale_cantieri_sync_20261027'
  AND section IN ('clients','jobs','consuntivi','documents')
ORDER BY section;
COMMIT;
