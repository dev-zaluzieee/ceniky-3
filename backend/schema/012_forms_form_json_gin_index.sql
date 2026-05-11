-- GIN index on forms.form_json so the new admin impact-diff endpoint can quickly
-- find forms whose productRows reference a given product_pricing_id via the
-- jsonb @> containment operator. Without this, large `forms` tables would
-- force a sequential scan on every impact-diff call.
--
-- Apply with:  psql "$DATABASE_URL" -f backend/schema/012_forms_form_json_gin_index.sql
--
-- Notes:
--   - CONCURRENTLY avoids locking the table during creation. Cannot run inside
--     a transaction; if your psql wrapper sets one, run the statement directly.
--   - jsonb_path_ops is the smaller, faster GIN variant — sufficient for the
--     containment-only queries we issue (no key-existence or text search).
--   - Verify presence with:
--       SELECT indexname FROM pg_indexes
--       WHERE tablename='forms' AND indexname='idx_forms_form_json_gin';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_forms_form_json_gin
  ON "public"."forms"
  USING GIN (form_json jsonb_path_ops);
