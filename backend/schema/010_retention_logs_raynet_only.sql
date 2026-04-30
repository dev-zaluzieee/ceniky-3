-- Allow retention_logs rows for events that have no linked local order ("Raynet-only").
-- The Raynet event id is the load-bearing identifier for the API call, so it becomes
-- the new primary linkage. order_id stays as an optional FK. raynet_id (customer) also
-- becomes optional (Raynet-only events without a company link can't populate it).
--
-- Apply with:  psql "$DATABASE_URL" -f backend/schema/010_retention_logs_raynet_only.sql

-- 1) New column for the event id, nullable so the backfill can run before NOT NULL is enforced.
ALTER TABLE "public"."retention_logs"
  ADD COLUMN IF NOT EXISTS "raynet_event_id" int4;

-- 2) Backfill existing rows from orders.source_raynet_event_id (chunk 1/2 only wrote rows
--    that had source_raynet_event_id set, so this should populate every existing row).
UPDATE "public"."retention_logs" rl
   SET raynet_event_id = o.source_raynet_event_id
  FROM "public"."orders" o
 WHERE rl.order_id = o.id
   AND rl.raynet_event_id IS NULL
   AND o.source_raynet_event_id IS NOT NULL;

-- 3) Loosen the constraints that previously assumed every row was order-linked.
ALTER TABLE "public"."retention_logs"
  ALTER COLUMN "order_id" DROP NOT NULL,
  ALTER COLUMN "raynet_id" DROP NOT NULL;

-- 4) Safety net: every row must reference at least one of (order_id, raynet_event_id),
--    so we always have something to key the log on.
ALTER TABLE "public"."retention_logs"
  DROP CONSTRAINT IF EXISTS retention_logs_at_least_one_link;
ALTER TABLE "public"."retention_logs"
  ADD CONSTRAINT retention_logs_at_least_one_link CHECK (
    order_id IS NOT NULL OR raynet_event_id IS NOT NULL
  );

-- 5) Index for "all retention attempts for this Raynet event" lookups.
CREATE INDEX IF NOT EXISTS idx_retention_logs_raynet_event_id
  ON "public"."retention_logs" ("raynet_event_id");
