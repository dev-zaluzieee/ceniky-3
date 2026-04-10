/**
 * Validation for JSON product forms: `price_affecting_enums` marks fields required per row
 * for pricing (unless disabled by payload.dependencies with field_disabled).
 * Merged defaults when those columns exist in form_body: `ks` (≥ 1), šířka/výška (positive mm).
 * Aliases align with backend `product-extractors` and size-limit lookup in `DynamicProductForm`.
 */

import type { CatalogFormRow, FormRow, PayloadDependency, ProductPayload } from "@/types/json-schema-form.types";

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

/** Flatten `CatalogFormRow` for dependency / missing checks (same shape as `FormRow`). */
export function catalogRowToFormRow(row: CatalogFormRow): FormRow {
  const base: FormRow = { id: row.id, ...row.values };
  if (row.linkGroupId !== undefined) base.linkGroupId = row.linkGroupId;
  return base;
}

/**
 * Multi-product rooms: each row has its own `form_body` codes and `price_affecting_enums`.
 */
export function hasAnyMissingPriceAffectingFieldsMulti(
  rooms: { name?: string; rows: CatalogFormRow[] }[],
  getRowSchema: (row: CatalogFormRow) => ProductPayload | undefined
): boolean {
  return rooms.some((room) =>
    room.rows.some((row) => {
      const rowSchema = getRowSchema(row);
      if (!rowSchema) return true;
      const codes = (rowSchema.form_body?.Properties ?? []).map((p) => p.Code);
      const required = buildEffectiveRequiredFieldCodes(codes, rowSchema.price_affecting_enums);
      if (required.size === 0) return false;
      const flat = catalogRowToFormRow(row);
      const deps = rowSchema.dependencies;
      return Array.from(required).some((code) => isPriceAffectingFieldMissing(flat, code, deps));
    })
  );
}

/** Build human-readable missing lines for multi-product validation. */
export function missingRequiredLinesMulti(
  rooms: { name?: string; rows: CatalogFormRow[] }[],
  getRowSchema: (row: CatalogFormRow) => ProductPayload | undefined,
  getPropertyLabel: (schema: ProductPayload, code: string) => string
): string[] {
  const lines: string[] = [];
  for (const room of rooms) {
    for (let ri = 0; ri < room.rows.length; ri++) {
      const row = room.rows[ri];
      const rowSchema = getRowSchema(row);
      if (!rowSchema) {
        lines.push(
          `${room.name?.trim() || "Místnost bez názvu"}, řádek ${ri + 1}: chybí šablona produktu (obnovte stránku nebo znovu vyberte produkt)`
        );
        continue;
      }
      const codes = (rowSchema.form_body?.Properties ?? []).map((p) => p.Code);
      const required = buildEffectiveRequiredFieldCodes(codes, rowSchema.price_affecting_enums);
      const flat = catalogRowToFormRow(row);
      const deps = rowSchema.dependencies;
      const missingCodes = Array.from(required).filter((code) =>
        isPriceAffectingFieldMissing(flat, code, deps)
      );
      if (missingCodes.length === 0) continue;
      const labels = missingCodes.map((code) => getPropertyLabel(rowSchema, code));
      const roomLabel = room.name?.trim() || "Místnost bez názvu";
      lines.push(`${roomLabel}, řádek ${ri + 1}: ${labels.join(", ")}`);
    }
  }
  return lines;
}
