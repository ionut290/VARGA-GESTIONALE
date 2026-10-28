-- Read-only candidate matching for unmatched child records under current commesse.
-- A matching collection + final path segment is only a candidate, never proof of identity.
-- Output contains collection names, path depth and counts only; no IDs or payloads.
BEGIN TRANSACTION READ ONLY;

WITH workspace_paths AS (
  SELECT COALESCE(r.value->>'sourcePath',r.value->>'id') AS item_path,
         string_to_array(COALESCE(r.value->>'sourcePath',r.value->>'id'),'/') AS parts
  FROM vg.workspace_sections ws
  CROSS JOIN LATERAL jsonb_array_elements(ws.data) AS r(value)
  WHERE ws.workspace_id='gestionale_cantieri_sync_20261027'
    AND ws.section='vcRecords'
),
missing AS (
  SELECT item_path,
         parts,
         cardinality(parts) AS path_depth,
         parts[3] AS child_collection,
         parts[cardinality(parts)] AS leaf_key
  FROM workspace_paths
  WHERE cardinality(parts)>=4
    AND parts[1]='commesse'
    AND EXISTS (
      SELECT 1 FROM vg.cantieri_source_stage parent
      WHERE parent.source_snapshot='current_sync'
        AND parent.collection_name='commesse'
        AND parent.path='commesse/'||parts[2]
    )
    AND NOT EXISTS (
      SELECT 1 FROM vg.cantieri_source_stage exact_current
      WHERE exact_current.source_snapshot='current_sync'
        AND exact_current.path=workspace_paths.item_path
    )
    AND NOT EXISTS (
      SELECT 1 FROM vg.cantieri_source_stage exact_previous
      WHERE exact_previous.source_snapshot='previous_sync'
        AND exact_previous.path=workspace_paths.item_path
    )
),
candidates AS (
  SELECT missing.child_collection,
         missing.path_depth,
         EXISTS (
           SELECT 1
           FROM vg.cantieri_source_stage s
           CROSS JOIN LATERAL (SELECT string_to_array(s.path,'/') AS parts) AS p
           WHERE s.source_snapshot='current_sync'
             AND cardinality(p.parts)>=4
             AND p.parts[1]='commesse'
             AND p.parts[3]=missing.child_collection
             AND p.parts[cardinality(p.parts)]=missing.leaf_key
             AND s.path<>missing.item_path
         ) AS same_leaf_key_current_other_path,
         EXISTS (
           SELECT 1
           FROM vg.cantieri_source_stage s
           CROSS JOIN LATERAL (SELECT string_to_array(s.path,'/') AS parts) AS p
           WHERE s.source_snapshot='previous_sync'
             AND cardinality(p.parts)>=4
             AND p.parts[1]='commesse'
             AND p.parts[3]=missing.child_collection
             AND p.parts[cardinality(p.parts)]=missing.leaf_key
             AND s.path<>missing.item_path
         ) AS same_leaf_key_previous_other_path
  FROM missing
)
SELECT child_collection,
       path_depth,
       same_leaf_key_current_other_path,
       same_leaf_key_previous_other_path,
       COUNT(*) AS records
FROM candidates
GROUP BY child_collection,path_depth,
         same_leaf_key_current_other_path,same_leaf_key_previous_other_path
ORDER BY child_collection,path_depth,
         same_leaf_key_current_other_path DESC,
         same_leaf_key_previous_other_path DESC;

ROLLBACK;
