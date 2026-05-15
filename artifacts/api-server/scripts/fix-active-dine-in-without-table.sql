-- Repair active dine-in orders that block KDS diagnostics because table_id is NULL.
--
-- Usage (review first, then run against the target database):
--   psql "$DATABASE_URL" -f artifacts/api-server/scripts/fix-active-dine-in-without-table.sql
--
-- This is an operational data-fix script, not a schema migration. It keeps all
-- active dine-in orders visible in KDS by assigning them to a clearly marked
-- recovery table and marking that table occupied.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM tables
     WHERE number = 9999
       AND section <> 'system-repair'
  ) THEN
    RAISE EXCEPTION 'Refusing ACTIVE_DINE_IN_WITHOUT_TABLE repair: table number 9999 already exists and is not section=system-repair.';
  END IF;
END $$;

WITH recovery_table AS (
  INSERT INTO tables (number, capacity, status, section, notes, created_at, updated_at)
  SELECT
    9999,
    1,
    'occupied',
    'system-repair',
    'Auto-created recovery table for ACTIVE_DINE_IN_WITHOUT_TABLE data repair.',
    NOW(),
    NOW()
  WHERE NOT EXISTS (SELECT 1 FROM tables WHERE number = 9999)
  RETURNING id
), target_table AS (
  SELECT id FROM recovery_table
  UNION ALL
  SELECT id FROM tables WHERE number = 9999 AND section = 'system-repair'
  LIMIT 1
), repaired_orders AS (
  UPDATE orders
     SET table_id = (SELECT id FROM target_table),
         updated_at = NOW()
   WHERE type = 'dine-in'
     AND status IN ('pending', 'preparing', 'ready')
     AND table_id IS NULL
  RETURNING id
)
UPDATE tables
   SET status = 'occupied',
       updated_at = NOW(),
       notes = COALESCE(NULLIF(notes, ''), 'Recovery table for active dine-in orders without table_id.'),
       section = 'system-repair'
 WHERE id = (SELECT id FROM target_table);

COMMIT;

SELECT o.id, o.status, o.table_id, t.number AS table_number
  FROM orders o
  JOIN tables t ON t.id = o.table_id
 WHERE t.number = 9999
   AND o.type = 'dine-in'
   AND o.status IN ('pending', 'preparing', 'ready')
 ORDER BY o.created_at ASC;
