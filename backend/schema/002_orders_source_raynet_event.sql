-- Link orders to Raynet calendar events (one active order per user/event)

ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "source_raynet_event_id" int4;

COMMENT ON COLUMN "public"."orders"."source_raynet_event_id"
  IS 'Optional Raynet event ID the order was created from';

-- Ensure each user can have at most one non-deleted order per event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_source_raynet_event_user
  ON "public"."orders" ("user_id", "source_raynet_event_id")
  WHERE "deleted_at" IS NULL AND "source_raynet_event_id" IS NOT NULL;
