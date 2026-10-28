-- Read-only inventory of child records retained in the isolated Cantieri sync workspace.
-- Reports counts and collection/path shape only; never emits IDs or business payloads.
BEGIN TRANSACTION READ ONLY;

WITH records AS (
  SELECT COALESCE(r.value->>'sourcePath',r.value->>'id') AS item_path
  FROM vg.workspace_sections ws
  CROSS JOIN LATERAL jsonb_array_elements(ws.data) AS r(value)
  WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
    AND ws.section='vcRecords'
),
classified AS (
  SELECT records.item_path,
         parts.path_parts,
         cardinality(parts.path_parts) AS path_depth,
         CASE WHEN cardinality(parts.path_parts)>=4
              THEN parts.path_parts[3]
              ELSE '(root-or-short-path)' END AS nested_collection,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot='current_sync'
             AND s.path=records.item_path
         ) AS exact_current,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot='previous_sync'
             AND s.path=records.item_path
         ) AS exact_previous,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot='current_sync'
             AND s.collection_name='commesse'
             AND s.path='commesse/'||parts.path_parts[2]
         ) AS parent_current
  FROM records
  CROSS JOIN LATERAL (
    SELECT string_to_array(records.item_path,'/') AS path_parts
  ) parts
  WHERE records.item_path LIKE 'commesse/%'
)
SELECT nested_collection,
       path_depth,
       parent_current,
       exact_current,
       exact_previous,
       COUNT(*) AS records
FROM classified
GROUP BY nested_collection,path_depth,parent_current,exact_current,exact_previous
ORDER BY nested_collection,path_depth,parent_current DESC,exact_current DESC,exact_previous DESC;

ROLLBACK;
