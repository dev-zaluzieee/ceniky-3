-- ADMF order-level slevy: bez-DPH → s-DPH semantic switch.
--
-- Two changes (both must be applied together, same DB, same transaction):
--   1) `forms.form_json`: rename keys `ovtSlevaCastka`/`mngSlevaCastka` (bez-DPH)
--      to `ovtSlevaSDph`/`mngSlevaSDph` (s-DPH). Multiplies by (1 + vatRate/100)
--      using each form's own `vatRate` (default 12 if absent), rounds to integer.
--   2) `office_admf_defaults`: rename columns `*_bez_dph` → `*_s_dph` and convert
--      stored values using the row's own `vat_rate_default_percent`.
--
-- Apply with:
--   psql "$DATABASE_URL" -f backend/schema/013_admf_slevy_to_s_dph.sql
--
-- Verification queries to run AFTER COMMIT (paste at the end of this file or
-- run separately):
--
--   -- Should show 0 rows of legacy keys remaining
--   SELECT COUNT(*) FROM forms
--     WHERE form_json ? 'ovtSlevaCastka' OR form_json ? 'mngSlevaCastka';
--
--   -- Spot-check a converted row
--   SELECT id,
--          form_json->>'vatRate'      AS vat,
--          form_json->>'ovtSlevaSDph' AS ovt_s_dph,
--          form_json->>'mngSlevaSDph' AS mng_s_dph
--   FROM forms
--   WHERE form_json ? 'ovtSlevaSDph' OR form_json ? 'mngSlevaSDph'
--   LIMIT 5;
--
--   -- Defaults — both new columns should exist, old ones gone
--   SELECT ovt_sleva_default_s_dph, mng_sleva_default_s_dph
--   FROM office_admf_defaults WHERE id = 1;

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) forms.form_json: rename + convert slevy keys.
--    Math: sDph = round(bezDph × (1 + vatRate / 100))
-- ────────────────────────────────────────────────────────────────────────────

WITH src AS (
  SELECT
    id,
    form_json,
    -- vatRate parsing mirrors backend's parseAdmfVatRatePercent (default 12)
    COALESCE(NULLIF(form_json->>'vatRate', '')::numeric, 12) AS vat_rate,
    NULLIF(form_json->>'ovtSlevaCastka', '')::numeric AS ovt_bez,
    NULLIF(form_json->>'mngSlevaCastka', '')::numeric AS mng_bez
  FROM forms
  WHERE form_json ? 'ovtSlevaCastka' OR form_json ? 'mngSlevaCastka'
),
patched AS (
  SELECT
    id,
    -- Strip the legacy keys, then add the new ones (if non-null and positive)
    (form_json - 'ovtSlevaCastka' - 'mngSlevaCastka')
      || CASE
           WHEN ovt_bez IS NOT NULL AND ovt_bez > 0
           THEN jsonb_build_object('ovtSlevaSDph', ROUND(ovt_bez * (1 + vat_rate / 100))::int)
           ELSE '{}'::jsonb
         END
      || CASE
           WHEN mng_bez IS NOT NULL AND mng_bez > 0
           THEN jsonb_build_object('mngSlevaSDph', ROUND(mng_bez * (1 + vat_rate / 100))::int)
           ELSE '{}'::jsonb
         END
      AS new_form_json
  FROM src
)
UPDATE forms f
SET form_json = patched.new_form_json
FROM patched
WHERE f.id = patched.id;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) office_admf_defaults: column rename + value conversion.
--    Use the row's own vat_rate_default_percent for the multiplier.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE office_admf_defaults
  ADD COLUMN IF NOT EXISTS ovt_sleva_default_s_dph integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mng_sleva_default_s_dph integer NOT NULL DEFAULT 0;

UPDATE office_admf_defaults
SET
  ovt_sleva_default_s_dph = ROUND(ovt_sleva_default_bez_dph * (1 + vat_rate_default_percent / 100))::int,
  mng_sleva_default_s_dph = ROUND(mng_sleva_default_bez_dph * (1 + vat_rate_default_percent / 100))::int;

ALTER TABLE office_admf_defaults
  DROP COLUMN ovt_sleva_default_bez_dph,
  DROP COLUMN mng_sleva_default_bez_dph;

COMMIT;
