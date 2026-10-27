-- Import all current Varga Cantieri-managed records into the active Oracle UI
-- sandbox. Gestionale-only sections/rows are retained; no row is physically deleted.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('varga-cantieri-all-ui-sync-20261027'));

CREATE TEMP TABLE cantieri_sync_job(root_path text,job_id text,job_code text,title text) ON COMMIT DROP;
INSERT INTO cantieri_sync_job
SELECT value->>'vcSourceId',value->>'id',COALESCE(value->>'code',''),COALESCE(value->>'title','')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
  AND ws.section='jobs'
  AND COALESCE(value->>'vcSourceId','') LIKE 'commesse/%';

DO $preflight$
BEGIN
  IF (SELECT count(*) FROM cantieri_sync_job)=0 THEN
    RAISE EXCEPTION 'STOP: nessuna commessa Varga Cantieri corrente identificata';
  END IF;
  IF (SELECT count(*) FROM cantieri_sync_job)<>
     (SELECT count(*) FROM vg.cantieri_source_stage
      WHERE source_snapshot='current_sync' AND collection_name='commesse'
        AND array_length(string_to_array(path,'/'),1)=2) THEN
    RAISE EXCEPTION 'STOP: la proiezione dei cantieri è incompleta; sincronizzazione annullata';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vg.workspaces WHERE id='gestionale_varga_ui_sandbox_20261027') THEN
    RAISE EXCEPTION 'STOP: workspace Oracle attivo non trovato';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.cantieri_source_stage s
    WHERE s.source_snapshot='current_sync' AND s.collection_name='commesse'
      AND array_length(string_to_array(s.path,'/'),1)=2
  ) THEN
    RAISE EXCEPTION 'STOP: nessuna commessa radice corrente trovata nella sorgente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM vg.workspace_sections ws,
         LATERAL jsonb_array_elements(ws.data) AS rows(value)
    JOIN vg.cantieri_source_stage s
      ON s.source_snapshot='current_sync' AND s.path=value->>'sourcePath'
    WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
      AND ws.section='vcRecords'
      AND value->>'sourcePath' LIKE 'commesse/%'
  ) THEN
    RAISE EXCEPTION 'STOP: nessun record corrente di Varga Cantieri disponibile';
  END IF;
END
$preflight$;

-- Keep a rollback copy of the affected sandbox sections in a private workspace
-- with no members. The active application workspace and production remain intact.
CREATE TEMP TABLE cantieri_backup_id(id text) ON COMMIT DROP;
INSERT INTO cantieri_backup_id VALUES('cantieri-ui-backup-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS'));
INSERT INTO vg.workspaces(id,revision,snapshot,updated_at,updated_by)
SELECT b.id,ws.revision,ws.snapshot,now(),NULL
FROM cantieri_backup_id b CROSS JOIN vg.workspaces ws
WHERE ws.id='gestionale_varga_ui_sandbox_20261027';
INSERT INTO vg.workspace_sections(workspace_id,section,revision,data,updated_at,updated_by)
SELECT b.id,section,revision,data,now(),NULL
FROM cantieri_backup_id b CROSS JOIN vg.workspace_sections
WHERE workspace_id='gestionale_varga_ui_sandbox_20261027'
  AND section IN ('jobs','clients','vcCommesse','vcImpianti','vcOre','vcSquadre','vcRecords','vcUtenti','vcSegnalazioni');

CREATE TEMP TABLE cantieri_incoming(section text NOT NULL,item jsonb NOT NULL,item_key text NOT NULL) ON COMMIT DROP;

-- All root work orders and their business job/client projections.
INSERT INTO cantieri_incoming
SELECT 'jobs',value,COALESCE(value->>'vcSourceId',value->>'id')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='jobs'
  AND value->>'vcSourceId' LIKE 'commesse/%';
INSERT INTO cantieri_incoming
SELECT 'clients',value,COALESCE(value->>'vcCommessaSourceId',value->>'id')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcCommessaSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='clients'
  AND value->>'vcCommessaSourceId' LIKE 'commesse/%';

-- Preserve the exact Varga Cantieri root document and all current nested records.
INSERT INTO cantieri_incoming
SELECT 'vcCommesse',value,COALESCE(value->>'vcSourceId',value->>'id')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='vcCommesse'
  AND value->>'vcSourceId' LIKE 'commesse/%';
INSERT INTO cantieri_incoming
SELECT 'vcRecords',value,COALESCE(value->>'sourcePath',value->>'id')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'sourcePath'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='vcRecords'
  AND value->>'sourcePath' LIKE 'commesse/%';

-- Import all current Varga Cantieri physical plants, hours, teams, users and reports.
INSERT INTO cantieri_incoming
SELECT ws.section,value,COALESCE(value->>'vcSourceId',value->>'id')
FROM vg.workspace_sections ws,LATERAL jsonb_array_elements(ws.data) AS rows(value)
JOIN vg.cantieri_source_stage s
  ON s.source_snapshot='current_sync' AND s.path=value->>'vcSourceId'
WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
  AND ws.section IN ('vcImpianti','vcOre','vcSquadre','vcUtenti','vcSegnalazioni');

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
    SELECT sections.section,
           COALESCE((
             SELECT jsonb_agg(unique_rows.item ORDER BY unique_rows.item_key)
             FROM (
               SELECT DISTINCT ON(incoming.item_key) incoming.item_key,incoming.item
               FROM cantieri_incoming incoming
               WHERE incoming.section=sections.section
               ORDER BY incoming.item_key
             ) unique_rows
           ),'[]'::jsonb) AS data
    FROM unnest(ARRAY['jobs','clients','vcCommesse','vcImpianti','vcOre',
                      'vcSquadre','vcRecords','vcUtenti','vcSegnalazioni']) AS sections(section)
    ORDER BY sections.section
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
      SELECT CASE
               WHEN (
                 item.section IN ('vcRecords','vcCommesse','vcImpianti','vcOre','vcSquadre','vcUtenti','vcSegnalazioni')
                 AND EXISTS (
                   SELECT 1 FROM vg.cantieri_source_stage stale
                   WHERE stale.path=COALESCE(old.value->>key_field,old.value->>'id')
                     AND stale.source_snapshot='previous_sync'
                 ))
                 OR (item.section IN ('jobs','clients') AND EXISTS (
                   SELECT 1 FROM vg.cantieri_source_stage stale
                   WHERE stale.path=COALESCE(old.value->>key_field,old.value->>'id')
                     AND stale.source_snapshot='previous_sync'
                     AND stale.collection_name='commesse'
                 ))
               THEN old.value||jsonb_build_object('vcArchived',true,'deleted',true,'operation','delete')
               ELSE old.value
             END AS item,
             old.ordinality*2 AS sort_key
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(old_data)='array' THEN old_data ELSE '[]'::jsonb END)
           WITH ORDINALITY AS old(value,ordinality)
      WHERE COALESCE(old.value->>key_field,old.value->>'id') IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(incoming_data) AS fresh(value)
           WHERE COALESCE(fresh.value->>key_field,fresh.value->>'id')
                 =COALESCE(old.value->>key_field,old.value->>'id')
         )
      UNION ALL
      SELECT COALESCE(matched.value,'{}'::jsonb)||fresh.value,
             (1000000000+fresh.ordinality*2) AS sort_key
      FROM jsonb_array_elements(incoming_data) WITH ORDINALITY AS fresh(value,ordinality)
      LEFT JOIN LATERAL (
        SELECT old.value
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(old_data)='array'
                                       THEN old_data ELSE '[]'::jsonb END)
             WITH ORDINALITY AS old(value,ordinality)
        WHERE COALESCE(old.value->>key_field,old.value->>'id')
              =COALESCE(fresh.value->>key_field,fresh.value->>'id')
        ORDER BY old.ordinality LIMIT 1
      ) matched ON true
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

SELECT 'backup_privato' AS controllo,id FROM cantieri_backup_id;
SELECT section,COUNT(*) AS record_importati
FROM cantieri_incoming GROUP BY section ORDER BY section;
SELECT COALESCE(SUM(lavorazioni),0) AS lavorazioni_correnti,
       COUNT(*) AS impianti_distinti,
       COUNT(*) FILTER (WHERE tutte_fatte) AS impianti_fatti
FROM (
  SELECT COALESCE(NULLIF(data->>'impiantoId',''),NULLIF(data->>'physicalPlantId',''),
         NULLIF(data->>'idSap',''),NULLIF(data->>'ID SAP',''),
         lower(btrim(concat_ws('|',data->>'denominazione',data->>'comune',data->>'indirizzo')))) AS plant_key,
         COUNT(*) AS lavorazioni,
         bool_and(lower(btrim(COALESCE(data->>'stato',data->>'status',''))) IN
           ('fatto','completato','completa','terminato') OR data->>'done'='true') AS tutte_fatte
  FROM (
    SELECT value->'data' AS data
    FROM vg.workspace_sections ws,
         LATERAL jsonb_array_elements(ws.data) AS rows(value)
    JOIN vg.cantieri_source_stage s
      ON s.source_snapshot='current_sync' AND s.path=value->>'sourcePath'
    WHERE ws.workspace_id='gestionale_cantieri_sync_20261027' AND ws.section='vcRecords'
      AND value->>'sourcePath' LIKE 'commesse/%/lavorazioni/%'
  ) work_rows
  GROUP BY plant_key
) plant_summary;
COMMIT;
