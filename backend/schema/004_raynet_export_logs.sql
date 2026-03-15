-- Raynet export logs table for monitoring ADMF → Raynet event exports
CREATE TABLE IF NOT EXISTS "public"."raynet_export_logs" (
    "id" serial PRIMARY KEY,
    "form_id" int4 NOT NULL REFERENCES "public"."forms"("id"),
    "order_id" int4 NOT NULL REFERENCES "public"."orders"("id"),
    "raynet_event_id" int4 NOT NULL,
    "user_id" varchar NOT NULL,
    "status" varchar NOT NULL CHECK (status IN ('PENDING', 'MAPPING', 'SENDING', 'SUCCESS', 'FAILED')),
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

COMMENT ON TABLE "public"."raynet_export_logs" IS 'Tracks every ADMF → Raynet event export attempt with full request/response for monitoring';

-- Indexes for common monitoring queries
CREATE INDEX IF NOT EXISTS idx_raynet_export_logs_user_created
  ON "public"."raynet_export_logs" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS idx_raynet_export_logs_status_created
  ON "public"."raynet_export_logs" ("status", "created_at");

CREATE INDEX IF NOT EXISTS idx_raynet_export_logs_form_id
  ON "public"."raynet_export_logs" ("form_id");

CREATE INDEX IF NOT EXISTS idx_raynet_export_logs_created_at
  ON "public"."raynet_export_logs" ("created_at");
