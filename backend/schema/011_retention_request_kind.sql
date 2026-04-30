-- Two-step retention workflow: OVT signals intent (OVT_REQUEST), office processes
-- and runs the full Raynet+ERP export (OFFICE_EXPORT). Both kinds live in
-- retention_logs; processed_* fields close the loop from REQUEST to EXPORT.
--
-- Apply with:  psql "$DATABASE_URL" -f backend/schema/011_retention_request_kind.sql

-- 1) Discriminator. Existing rows are full-fat exports → backfill 'OFFICE_EXPORT'.
ALTER TABLE "public"."retention_logs"
  ADD COLUMN IF NOT EXISTS "kind" varchar NOT NULL DEFAULT 'OFFICE_EXPORT';
ALTER TABLE "public"."retention_logs"
  DROP CONSTRAINT IF EXISTS retention_logs_kind_check;
ALTER TABLE "public"."retention_logs"
  ADD CONSTRAINT retention_logs_kind_check
  CHECK (kind IN ('OVT_REQUEST', 'OFFICE_EXPORT'));

-- 2) Closure fields — set on an OVT_REQUEST row when an office user processes it.
ALTER TABLE "public"."retention_logs"
  ADD COLUMN IF NOT EXISTS "processed_at" timestamptz;
ALTER TABLE "public"."retention_logs"
  ADD COLUMN IF NOT EXISTS "processed_by" varchar;
ALTER TABLE "public"."retention_logs"
  ADD COLUMN IF NOT EXISTS "processed_log_id" int4 REFERENCES "public"."retention_logs"("id");

COMMENT ON COLUMN "public"."retention_logs"."kind"
  IS 'OVT_REQUEST = lightweight signal from OVT; OFFICE_EXPORT = full Raynet+ERP export by office.';
COMMENT ON COLUMN "public"."retention_logs"."processed_at"
  IS 'When set on an OVT_REQUEST row, the request has been processed by office.';
COMMENT ON COLUMN "public"."retention_logs"."processed_log_id"
  IS 'On a closed OVT_REQUEST, points at the OFFICE_EXPORT row that closed it.';

-- 3) Partial index for the open-request inbox (queue, prefill lookup).
CREATE INDEX IF NOT EXISTS idx_retention_logs_open_ovt_requests
  ON "public"."retention_logs" ("order_id", "raynet_event_id", "created_at" DESC)
  WHERE kind = 'OVT_REQUEST' AND processed_at IS NULL;
