-- Retention logs: tracks every "Poslat na retence" action initiated from the OVT app.
-- Per-order action (not per-form) — there is no form_id column.
-- The two side-effect targets (Raynet tags+note, ERP fields) are not yet wired in chunk 1;
-- request_payload holds a "stub plan" describing what *would* be sent so the data model
-- is exercised end-to-end before the real integrations land.
--
-- Apply with:  psql "$DATABASE_URL" -f backend/schema/009_retention_logs.sql

CREATE TABLE IF NOT EXISTS "public"."retention_logs" (
    "id" serial PRIMARY KEY,
    "order_id" int4 NOT NULL REFERENCES "public"."orders"("id"),
    "user_id" varchar NOT NULL,
    "reason" text NOT NULL,
    "raynet_id" int4 NOT NULL,
    "erp_order_id" int4,
    "status" varchar NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED')),
    "test_mode" boolean NOT NULL DEFAULT false,
    "request_payload" jsonb,
    "response_status" int4,
    "response_body" jsonb,
    "error_message" text,
    "error_code" varchar,
    "warnings" jsonb,
    "duration_ms" int4,
    "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" timestamptz
);

COMMENT ON TABLE "public"."retention_logs" IS 'Tracks every OVT "Poslat na retence" attempt. Source of truth for "is this order in retention" is Raynet tags once chunk-2 wires the integration; this table remains the audit trail.';
COMMENT ON COLUMN "public"."retention_logs"."raynet_id" IS 'Snapshot of orders.raynet_id at submission. Always required.';
COMMENT ON COLUMN "public"."retention_logs"."erp_order_id" IS 'Snapshot of orders.source_erp_order_id at submission. NULL means no ERP zakázka linked — ERP step will be skipped in chunk 2.';
COMMENT ON COLUMN "public"."retention_logs"."request_payload" IS 'Chunk 1: stub plan describing planned Raynet/ERP calls. Chunk 2: actual request bodies sent.';

CREATE INDEX IF NOT EXISTS idx_retention_logs_user_created
  ON "public"."retention_logs" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS idx_retention_logs_status_created
  ON "public"."retention_logs" ("status", "created_at");

CREATE INDEX IF NOT EXISTS idx_retention_logs_order_id
  ON "public"."retention_logs" ("order_id");

CREATE INDEX IF NOT EXISTS idx_retention_logs_created_at
  ON "public"."retention_logs" ("created_at");
