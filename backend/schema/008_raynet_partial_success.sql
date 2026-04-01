-- Extend Raynet export logs status values with PARTIAL_SUCCESS.
-- This enables best-effort attachment uploads where the main event update succeeds,
-- but one or more attachments fail (still a successful export with warnings).

ALTER TABLE "public"."raynet_export_logs"
  DROP CONSTRAINT IF EXISTS raynet_export_logs_status_check;

ALTER TABLE "public"."raynet_export_logs"
  ADD CONSTRAINT raynet_export_logs_status_check
  CHECK (status IN ('PENDING', 'MAPPING', 'SENDING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'));

