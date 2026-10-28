-- Read-only audit for Cantieri rows retained in the isolated Gestionale sync workspace.
-- Run against database varga_gestionale. This script does not alter staging or workspaces.
BEGIN TRANSACTION READ ONLY;

-- Inventory of vcRecords missing an exact path in the latest snapshot.
WITH records AS (
  SELECT COALESCE(r.value->>'sourcePath', r.value->>'id') AS item_path
  FROM vg.workspace_sections ws
  CROSS JOIN LATERAL jsonb_array_elements(ws.data) AS r(value)
  WHERE ws.workspace_id = 'gestionale_cantieri_sync_20261027'
    AND ws.section = 'vcRecords'
),
classified AS (
  SELECT item_path,
         split_part(item_path, '/', 1) AS collection_name,
         split_part(item_path, '/', 2) AS parent_id,
         (item_path IS NOT NULL) AS has_key,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot = 'current_sync' AND s.path = records.item_path
         ) AS exact_current,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot = 'previous_sync' AND s.path = records.item_path
         ) AS exact_previous,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot = 'current_sync'
             AND s.collection_name = 'commesse'
             AND s.path = 'commesse/' || split_part(records.item_path, '/', 2)
         ) AS parent_current,
         EXISTS (
           SELECT 1 FROM vg.cantieri_source_stage s
           WHERE s.source_snapshot = 'previous_sync'
             AND s.collection_name = 'commesse'
             AND s.path = 'commesse/' || split_part(records.item_path, '/', 2)
         ) AS parent_previous
  FROM records
)
SELECT collection_name,
       CASE
         WHEN NOT has_key THEN 'missing-stable-key'
         WHEN exact_current THEN 'exact-current'
         WHEN exact_previous THEN 'exact-previous-only'
         WHEN parent_current THEN 'nested-under-current-commessa-no-exact-match'
         WHEN parent_previous THEN 'nested-under-previous-commessa'
         ELSE 'no-exact-or-commessa-parent-match'
       END AS classification,
       COUNT(*) AS records
FROM classified
GROUP BY collection_name, classification
ORDER BY collection_name, classification;

-- Detail only for nested commesse records under a current parent, so the
-- source owner can compare paths without dumping business payloads.
WITH records AS (
  SELECT COALESCE(r.value->>'sourcePath', r.value->>'id') AS item_path
  FROM vg.workspace_sections ws
  CROSS JOIN LATERAL jsonb_array_elements(ws.data) AS r(value)
  WHERE ws.workspace_id = 'gestionale_cantieri_sync_20261027'
    AND ws.section = 'vcRecords'
),
missing AS (
  SELECT records.item_path,
         split_part(records.item_path, '/', 2) AS parent_id
  FROM records
  WHERE NOT EXISTS (
    SELECT 1 FROM vg.cantieri_source_stage s
    WHERE s.source_snapshot = 'current_sync' AND s.path = records.item_path
  )
)
SELECT missing.item_path,
       'commesse/' || missing.parent_id AS parent_commessa_path,
       MAX(parent.update_time) FILTER (WHERE parent.source_snapshot = 'current_sync')
         AS current_parent_update_time,
       MAX(previous.update_time) FILTER (WHERE previous.source_snapshot = 'previous_sync')
         AS previous_parent_update_time,
       COUNT(child.path) FILTER (WHERE child.source_snapshot = 'current_sync')
         AS current_exact_path_matches,
       COUNT(child.path) FILTER (WHERE child.source_snapshot = 'previous_sync')
         AS previous_exact_path_matches
FROM missing
LEFT JOIN vg.cantieri_source_stage parent
  ON parent.collection_name = 'commesse'
 AND parent.path = 'commesse/' || missing.parent_id
 AND parent.source_snapshot IN ('current_sync', 'previous_sync')
LEFT JOIN vg.cantieri_source_stage child
  ON child.path = missing.item_path
 AND child.source_snapshot IN ('current_sync', 'previous_sync')
WHERE missing.item_path LIKE 'commesse/%/%'
  AND EXISTS (
    SELECT 1 FROM vg.cantieri_source_stage s
    WHERE s.source_snapshot = 'current_sync'
      AND s.collection_name = 'commesse'
      AND s.path = 'commesse/' || missing.parent_id
  )
GROUP BY missing.item_path, missing.parent_id
ORDER BY missing.item_path;

ROLLBACK;
