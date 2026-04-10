/**
 * When switching a row's catalog product, compute copied values and human-readable loss list.
 * Rules: same `Code` + same `DataType` → copy; enums only if current value is empty or valid in new schema.
 */

import type { PropertyDefinition, ProductPayload } from "@/types/json-schema-form.types";

export interface ProductSwitchLossField {
  code: string;
  label: string;
  reason: string;
}

function propLabel(p: PropertyDefinition): string {
  return (p["label-form"] ?? p.Name ?? p.Code).trim() || p.Code;
}

function formBodyProps(schema: ProductPayload): PropertyDefinition[] {
  return (schema.form_body?.Properties ?? []) as PropertyDefinition[];
}

/** Enum codes allowed for `propertyCode` in `newSchema` (default group only, like row UI). */
function allowedEnumCodes(newSchema: ProductPayload, propertyCode: string): Set<string> {
  const entry = newSchema.enums?.[propertyCode];
  if (!entry?.default) return new Set();
  return new Set(entry.default.filter((o) => o.active !== false).map((o) => o.code));
}

/**
 * @returns merged `values` for the new product row and fields user will lose (for modal).
 */
export function mergeValuesForProductSwitch(
  oldSchema: ProductPayload,
  newSchema: ProductPayload,
  oldValues: Record<string, string | number | boolean>
): { merged: Record<string, string | number | boolean>; lostFields: ProductSwitchLossField[] } {
  const lostFields: ProductSwitchLossField[] = [];
  const newProps = formBodyProps(newSchema);
  const newByCode = new Map(newProps.map((p) => [p.Code, p]));
  const oldProps = formBodyProps(oldSchema);
  const oldByCode = new Map(oldProps.map((p) => [p.Code, p]));

  for (const oldProp of oldProps) {
    const code = oldProp.Code;
    const raw = oldValues[code];
    const newProp = newByCode.get(code);
    if (!newProp || newProp.DataType !== oldProp.DataType) {
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
        if (oldProp.DataType === "boolean" || oldProp.DataType === "link") {
          if (raw === true) {
            lostFields.push({
              code,
              label: propLabel(oldProp),
              reason: "Sloupec v novém produktu chybí nebo má jiný typ",
            });
          }
        } else {
          lostFields.push({
            code,
            label: propLabel(oldProp),
            reason: newProp ? "Změna datového typu" : "Sloupec v novém produktu chybí",
          });
        }
      }
      continue;
    }

    if (oldProp.DataType === "enum") {
      const s = raw !== undefined && raw !== null ? String(raw).trim() : "";
      if (s === "") continue;
      const allowed = allowedEnumCodes(newSchema, code);
      if (!allowed.has(s)) {
        lostFields.push({
          code,
          label: propLabel(oldProp),
          reason: `Hodnota „${s}“ není v novém produktu k dispozici`,
        });
      }
      continue;
    }
  }

  const merged: Record<string, string | number | boolean> = {};
  for (const newProp of newProps) {
    const code = newProp.Code;
    const oldProp = oldByCode.get(code);
    const raw = oldValues[code];
    if (!oldProp || oldProp.DataType !== newProp.DataType) {
      if (newProp.Value !== undefined) merged[code] = newProp.Value;
      else if (newProp.DataType === "boolean" || newProp.DataType === "link") merged[code] = false;
      else if (newProp.DataType === "numeric") merged[code] = "";
      else merged[code] = "";
      continue;
    }

    if (newProp.DataType === "enum") {
      const s = raw !== undefined && raw !== null ? String(raw).trim() : "";
      if (s === "") {
        merged[code] = "";
        continue;
      }
      const allowed = allowedEnumCodes(newSchema, code);
      merged[code] = allowed.has(s) ? s : "";
      continue;
    }

    if (raw === undefined || raw === null) {
      if (newProp.Value !== undefined) merged[code] = newProp.Value;
      else if (newProp.DataType === "boolean" || newProp.DataType === "link") merged[code] = false;
      else if (newProp.DataType === "numeric") merged[code] = "";
      else merged[code] = "";
      continue;
    }
    merged[code] = raw as string | number | boolean;
  }

  return { merged, lostFields };
}

/** Empty row `values` for a product schema (form_body only). */
export function emptyValuesForProductSchema(schema: ProductPayload): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const prop of formBodyProps(schema)) {
    if (prop.Value !== undefined) out[prop.Code] = prop.Value;
    else if (prop.DataType === "boolean" || prop.DataType === "link") out[prop.Code] = false;
    else if (prop.DataType === "numeric") out[prop.Code] = "";
    else out[prop.Code] = "";
  }
  return out;
}
