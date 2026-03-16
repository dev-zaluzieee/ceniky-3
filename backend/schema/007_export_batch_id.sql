-- Add export_batch_id to raynet_export_logs for linking with ERP exports
ALTER TABLE raynet_export_logs ADD COLUMN IF NOT EXISTS export_batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_raynet_export_logs_batch_id ON raynet_export_logs (export_batch_id);
