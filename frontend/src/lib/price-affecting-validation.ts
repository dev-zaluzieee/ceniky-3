/**
 * Validation for JSON product forms: `price_affecting_enums` marks fields required per row
 * for pricing (unless disabled by payload.dependencies with field_disabled).
 */

import type { FormRow, PayloadDependency } from "@/types/json-schema-form.types";

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

/** Empty value on a price-affecting field that is not dependency-disabled. */
export function isPriceAffectingFieldMissing(
  row: FormRow,
  code: string,
  dependencies: PayloadDependency[] | undefined
): boolean {
  if (isRowFieldDisabledByDependency(row, code, dependencies)) return false;
  const v = row[code];
  return v === undefined || v === null || String(v).trim() === "";
}

/** Any row in any room missing at least one required price-affecting field. */
export function hasAnyMissingPriceAffectingFields(
  rooms: { rows: FormRow[] }[],
  priceAffectingEnums: Set<string>,
  dependencies: PayloadDependency[] | undefined
): boolean {
  if (priceAffectingEnums.size === 0) return false;
  return rooms.some((room) =>
    room.rows.some((row) =>
      Array.from(priceAffectingEnums).some((code) =>
        isPriceAffectingFieldMissing(row, code, dependencies)
      )
    )
  );
}
