-- Import current INRETE MODENA source records into the active Oracle UI sandbox.
-- Current source comes from the read-only staging projection and isolated sync
-- workspace. Existing unrelated rows are retained; nothing is physically deleted.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('varga-inrete-modena-ui-sync-20261027'));

CREATE TEMP TABLE inrete_sync_job(root_path text,job_id text,job_code text,title text) ON COMMIT DROP;
INSERT INTO inrete_sync_job
SELECT value->>'vcSourceId',value->>'id',COALESCE(value->>'code',''),COALESCE(value->>'title','')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
  AND ws.section='jobs'
  AND (
    lower(regexp_replace(COALESCE(value->>'title',''),'[^a-z0-9]+','','g'))='inretemodena'
    OR (regexp_replace(COALESCE(value->>'code',''),'[^0-9]','','g')='28015'
        AND lower(COALESCE(value->>'title','')) LIKE '%inrete%modena%')
  )
  AND COALESCE(value->>'vcSourceId','') LIKE 'commesse/%';

DO $preflight$
BEGIN
  IF (SELECT count(*) FROM inrete_sync_job)<>1 THEN
    RAISE EXCEPTION 'STOP: la sorgente corrente non identifica una sola commessa INRETE MODENA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vg.workspaces WHERE id='gestionale_varga_ui_sandbox_20261027') THEN
    RAISE EXCEPTION 'STOP: workspace Oracle attivo non trovato';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.workspace_sections ws,inrete_sync_job j,
         LATERAL jsonb_array_elements(ws.data) AS rows(value)
    WHERE ws.workspace_id='gestionale_varga_ui_sandbox_20261027'
      AND ws.section='jobs' AND value->>'vcSourceId'=j.root_path
  ) THEN
    RAISE EXCEPTION 'STOP: INRETE MODENA non esiste già nella copia Oracle; nessun import applicato';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.cantieri_source_stage s,inrete_sync_job j
    WHERE s.source_snapshot='current_sync' AND s.path=j.root_path
      AND s.collection_name='commesse'
  ) THEN
    RAISE EXCEPTION 'STOP: documento radice corrente INRETE MODENA non trovato';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.workspace_sections ws,inrete_sync_job j,
         LATERAL jsonb_array_elements(ws.data) AS rows(value)
    JOIN vg.cantieri_source_stage s
      ON s.source_snapshot='current_sync' AND s.path=value->>'sourcePath'
    WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
      AND ws.section='vcRecords'
      AND (value->>'sourcePath'=j.root_path
           OR value->>'sourcePath' LIKE j.root_path||'/%')
  ) THEN
    RAISE EXCEPTION 'STOP: nessuna riga corrente della commessa disponibile';
  END IF;
END
$preflight$;

-- Keep a rollback copy of the affected sandbox sections in a private workspace
-- with no members. The active application workspace and production remain intact.
CREATE TEMP TABLE inrete_backup_id(id text) ON COMMIT DROP;
INSERT INTO inrete_backup_id VALUES('inrete-modena-backup-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS'));
INSERT INTO vg.workspaces(id,revision,snapshot,updated_at,updated_by)
SELECT b.id,ws.revision,ws.snapshot,now(),NULL
FROM inrete_backup_id b CROSS JOIN vg.workspaces ws
WHERE ws.id='gestionale_varga_ui_sandbox_20261027';
INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_at,updated_by)
SELECT b.id,section,revision,data,now(),NULL
FROM inrete_backup_id b CROSS JOIN vg.workspace_sections
WHERE workspace_id='gestionale_varga_ui_sandbox_20261027'
  AND section IN ('jobs','clients','vcCommesse','vcImpianti','vcOre','vcSquadre','vcRecords');

CREATE TEMP TABLE inrete_incoming(section text NOT NULL,item jsonb NOT NULL,item_key text NOT NULL) ON COMMIT DROP;

-- Root work order and business job/client rows.
INSERT INTO inrete_incoming
SELECT 'jobs',value,COALESCE(value->>'vcSourceId',value->>'id')
FROM vg.workspace_sections ws,inrete_sync_job j,LATERAL jsonb_array_elements(ws.data) AS rows(value)
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='jobs'
  AND value->>'vcSourceId'=j.root_path;
INSERT INTO inrete_incoming
SELECT 'clients',value,COALESCE(value->>'vcCommessaSourceId',value->>'id')
FROM vg.workspace_sections ws,inrete_sync_job j,LATERAL jsonb_array_elements(ws.data) AS rows(value)
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='clients'
  AND value->>'vcCommessaSourceId'=j.root_path;

-- Preserve the exact Varga Cantieri root document and all current nested records.
INSERT INTO inrete_incoming
SELECT 'vcCommesse',value,COALESCE(value->>'vcSourceId',value->>'id')
FROM vg.workspace_sections ws,inrete_sync_job j,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='vcCommesse'
  AND value->>'vcSourceId'=j.root_path;
INSERT INTO inrete_incoming
SELECT 'vcRecords',value,COALESCE(value->>'sourcePath',value->>'id')
FROM vg.workspace_sections ws,inrete_sync_job j,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'sourcePath'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='vcRecords'
  AND (value->>'sourcePath'=j.root_path
       OR value->>'sourcePath' LIKE j.root_path||'/%');

-- Import current physical plants, hours and teams explicitly linked to this job.
INSERT INTO inrete_incoming
SELECT ws.section,value,COALESCE(value->>'vcSourceId',value->>'id')
FROM vg.workspace_sections ws,inrete_sync_job j,
     LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
  AND ws.section IN ('vcImpianti','vcOre','vcSquadre')
  AND (
    COALESCE(value->>'commessaId',value->>'jobId','')=j.job_id
    OR lower(btrim(COALESCE(value->>'commessa','')))=lower(btrim(j.title))
    OR lower(btrim(COALESCE(value->>'nomeCommessa','')))=lower(btrim(j.title))
    OR lower(btrim(COALESCE(value->>'codiceCommessa','')))=lower(btrim(j.job_code))
    OR value->>'vcSourceId'=j.root_path
    OR value->>'vcSourceId' LIKE j.root_path||'/%'
  );

DO $apply$
DECLARE
  item record;
  old_data jsonb;
  incoming_data jsonb;
  merged_data jsonb;
  revision_now bigint;
  revision_next bigint;
  key_field text;
BEGIN
  FOR item IN
    SELECT section,jsonb_agg(value.item ORDER BY value.item_key) AS data
    FROM (SELECT DISTINCT ON(section,item_key) section,item_key,item FROM inrete_incoming
          ORDER BY section,item_key) value
    GROUP BY section ORDER BY section
  LOOP
    SELECT data,revision INTO old_data,revision_now
    FROM vg.workspace_sections
    WHERE workspace_id='gestionale_varga_ui_sandbox_20261027' AND section=item.section
    FOR UPDATE;
    IF old_data IS NULL THEN
      old_data:='[]'::jsonb; revision_now:=0;
    END IF;
    incoming_data:=item.data;
    key_field:=CASE item.section
      WHEN 'vcRecords' THEN 'sourcePath'
      WHEN 'clients' THEN 'vcCommessaSourceId'
      ELSE 'vcSourceId'
    END;
    SELECT COALESCE(jsonb_agg(merged.item ORDER BY merged.sort_key),'[]'::jsonb)
    INTO merged_data
    FROM (
      SELECT old.value AS item,old.ordinality*2 AS sort_key
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(old_data)='array' THEN old_data ELSE '[]'::jsonb END)
           WITH ORDINALITY AS old(value,ordinality)
      WHERE COALESCE(old.value->>key_field,old.value->>'id') IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(incoming_data) AS fresh(value)
           WHERE COALESCE(fresh.value->>key_field,fresh.value->>'id')
                 =COALESCE(old.value->>key_field,old.value->>'id')
         )
      UNION ALL
      SELECT fresh.value,(1000000000+fresh.ordinality*2) AS sort_key
      FROM jsonb_array_elements(incoming_data) WITH ORDINALITY AS fresh(value,ordinality)
    ) merged;
    IF merged_data IS DISTINCT FROM old_data THEN
      revision_next:=revision_now+1;
      INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_at,updated_by)
      VALUES('gestionale_varga_ui_sandbox_20261027',item.section,revision_next,merged_data,now(),NULL)
      ON CONFLICT(workspace_id,section) DO UPDATE SET
        revision=EXCLUDED.revision,data=EXCLUDED.data,updated_at=now(),updated_by=NULL;
      INSERT INTO vg.workspace_section_audit(workspace_id,section,user_id,revision,sha256)
      VALUES('gestionale_varga_ui_sandbox_20261027',item.section,NULL,revision_next,
             encode(digest(merged_data::text,'sha256'),'hex'))
      ON CONFLICT(workspace_id,section,revision) DO NOTHING;
    END IF;
  END LOOP;
  UPDATE vg.workspaces SET revision=revision+1,updated_at=now()
  WHERE id='gestionale_varga_ui_sandbox_20261027';
END
$apply$;

SELECT 'backup_privato' AS controllo,id FROM inrete_backup_id;
SELECT section,COUNT(*) AS record_importati
FROM inrete_incoming GROUP BY section ORDER BY section;
SELECT COUNT(*) AS lavorazioni_correnti,
       COUNT(DISTINCT COALESCE(NULLIF(data->>'impiantoId',''),NULLIF(data->>'physicalPlantId',''),
         NULLIF(data->>'idSap',''),NULLIF(data->>'ID SAP',''),
         lower(btrim(concat_ws('|',data->>'denominazione',data->>'comune',data->>'indirizzo'))))) AS impianti_distinti,
       COUNT(DISTINCT plant_key) FILTER (WHERE tutte_fatte) AS impianti_fatti
FROM (
  SELECT COALESCE(NULLIF(data->>'impiantoId',''),NULLIF(data->>'physicalPlantId',''),
         NULLIF(data->>'idSap',''),NULLIF(data->>'ID SAP',''),
         lower(btrim(concat_ws('|',data->>'denominazione',data->>'comune',data->>'indirizzo')))) AS plant_key,
         bool_and(lower(btrim(COALESCE(data->>'stato',data->>'status',''))) IN
           ('fatto','completato','completa','terminato') OR data->>'done'='true') AS tutte_fatte
  FROM (
    SELECT value->'data' AS data
    FROM vg.workspace_sections ws,inrete_sync_job j,
         LATERAL jsonb_array_elements(ws.data) AS rows(value)
    JOIN vg.cantieri_source_stage s
      ON s.source_snapshot='current_sync' AND s.path=value->>'sourcePath'
    WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='vcRecords'
      AND value->>'sourcePath' LIKE j.root_path||'/lavorazioni/%'
  ) work_rows
  GROUP BY plant_key
) plant_summary;
COMMIT;
