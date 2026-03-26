/**
 * Validation for JSON product forms: `price_affecting_enums` marks fields required per row
 * for pricing (unless disabled by payload.dependencies with field_disabled).
 * `ks` is merged in when present in form_body — required quantity ≥ 1.
 */

import type { FormRow, PayloadDependency } from "@/types/json-schema-form.types";

/** Canonical code for quantity column in form_body (when present). */
export const KS_PROPERTY_CODE = "ks";

/**
 * Required field codes for UI + validation: catalog `price_affecting_enums` plus `ks`
 * when that column exists in form_body.
 */
export function buildEffectiveRequiredFieldCodes(
  formBodyPropertyCodes: readonly string[],
  priceAffectingEnums: readonly string[] | undefined
): Set<string> {
  const set = new Set<string>(priceAffectingEnums ?? []);
  if (formBodyPropertyCodes.includes(KS_PROPERTY_CODE)) {
    set.add(KS_PROPERTY_CODE);
  }
  return set;
}

/** True when dependency rules hide/disable this field for the row (user cannot fill it). */
export function isRowFieldDisabledByDependency(
  row: FormRow,
  propertyCode: string,
  dependencies: PayloadDependency[] | undefined
): boolean {
  const deps = dependencies ?? [];
  const disabledDeps = deps.filter(
    (d) => d.target_property === propertyCode && d.field_disabled === true
  );
  return disabledDeps.some((dep) => {
    const sourceVal = row[dep.source_enum];
    if (sourceVal === undefined || sourceVal === null) return false;
    return String(sourceVal) === String(dep.source_value);
  });
}

/**
 * Missing / invalid value for a required field (price-affecting or default `ks`).
 * `ks` must be a positive integer (≥ 1) when present.
 */
export function isPriceAffectingFieldMissing(
  row: FormRow,
  code: string,
  dependencies: PayloadDependency[] | undefined
): boolean {
  if (isRowFieldDisabledByDependency(row, code, dependencies)) return false;
  const v = row[code];
  if (code === KS_PROPERTY_CODE) {
    if (v === undefined || v === null) return true;
    const s = String(v).trim();
    if (s === "") return true;
    const n = parseInt(s, 10);
    return !Number.isFinite(n) || n < 1;
  }
  return v === undefined || v === null || String(v).trim() === "";
}

/** Any row in any room missing at least one required field in the effective set. */
export function hasAnyMissingPriceAffectingFields(
  rooms: { rows: FormRow[] }[],
  requiredFieldCodes: Set<string>,
  dependencies: PayloadDependency[] | undefined
): boolean {
  if (requiredFieldCodes.size === 0) return false;
  return rooms.some((room) =>
    room.rows.some((row) =>
      Array.from(requiredFieldCodes).some((code) =>
        isPriceAffectingFieldMissing(row, code, dependencies)
      )
    )
  );
}
