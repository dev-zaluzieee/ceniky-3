CREATE TABLE IF NOT EXISTS "public"."erp_export_logs" (
    "id" serial PRIMARY KEY,
    "form_id" int4 NOT NULL REFERENCES "public"."forms"("id"),
    "order_id" int4 NOT NULL REFERENCES "public"."orders"("id"),
    "erp_order_id" int4 NOT NULL,
    "user_id" varchar NOT NULL,
    "export_batch_id" uuid,
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

CREATE INDEX idx_erp_export_logs_user_created ON erp_export_logs (user_id, created_at);
CREATE INDEX idx_erp_export_logs_status_created ON erp_export_logs (status, created_at);
CREATE INDEX idx_erp_export_logs_form_id ON erp_export_logs (form_id);
CREATE INDEX idx_erp_export_logs_created_at ON erp_export_logs (created_at);
CREATE INDEX idx_erp_export_logs_batch_id ON erp_export_logs (export_batch_id);
