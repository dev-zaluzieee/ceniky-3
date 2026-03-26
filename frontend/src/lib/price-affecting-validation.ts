/**
 * Validation for JSON product forms: `price_affecting_enums` marks fields required per row
 * for pricing (unless disabled by payload.dependencies with field_disabled).
 * Merged defaults when those columns exist in form_body: `ks` (≥ 1), šířka/výška (positive mm).
 * Aliases align with backend `product-extractors` and size-limit lookup in `DynamicProductForm`.
 */

import type { FormRow, PayloadDependency } from "@/types/json-schema-form.types";

/** Canonical code for quantity column in form_body (when present). */
export const KS_PROPERTY_CODE = "ks";

/** Width column `Code` variants — first match in form_body is used for dimensions. */
export const WIDTH_CODES = ["ovl_sirka", "width", "Sirka", "sirka", "šířka"] as const;

/** Height column `Code` variants — first match in form_body is used for dimensions. */
export const HEIGHT_CODES = ["ovl_vyska", "height", "Vyska", "vyska", "výška"] as const;

const WIDTH_CODE_SET = new Set<string>([...WIDTH_CODES]);
const HEIGHT_CODE_SET = new Set<string>([...HEIGHT_CODES]);
const DIMENSION_CODE_SET = new Set<string>([...WIDTH_CODES, ...HEIGHT_CODES]);

/** True when `code` is the form_body width column (any alias). */
export function isWidthPropertyCode(code: string): boolean {
  return WIDTH_CODE_SET.has(code);
}

/** True when `code` is the form_body height column (any alias). */
export function isHeightPropertyCode(code: string): boolean {
  return HEIGHT_CODE_SET.has(code);
}

/** True when `code` is a known width/height property code (schema uses one variant per axis). */
export function isDimensionPropertyCode(code: string): boolean {
  return DIMENSION_CODE_SET.has(code);
}

/**
 * Required field codes for UI + validation: catalog `price_affecting_enums` plus `ks`
 * and any width/height columns present in form_body (pricing grid + extractors need them).
 */
export function buildEffectiveRequiredFieldCodes(
  formBodyPropertyCodes: readonly string[],
  priceAffectingEnums: readonly string[] | undefined
): Set<string> {
  const set = new Set<string>(priceAffectingEnums ?? []);
  if (formBodyPropertyCodes.includes(KS_PROPERTY_CODE)) {
    set.add(KS_PROPERTY_CODE);
  }
  for (const code of formBodyPropertyCodes) {
    if (isDimensionPropertyCode(code)) {
      set.add(code);
    }
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
 * Missing / invalid value for a required field (price-affecting or merged defaults).
 * `ks`: positive integer ≥ 1. Dimension columns: positive numeric (mm), same as pricing extract.
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
  if (isDimensionPropertyCode(code)) {
    if (v === undefined || v === null) return true;
    const s = String(v).trim();
    if (s === "") return true;
    const n = Number(s);
    return !Number.isFinite(n) || n <= 0;
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
