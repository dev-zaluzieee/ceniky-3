/**
 * Product extractors: turn step 1 form form_json into product lines for ADMF.
 * Prices are resolved from pricing DB (pricing_variant) using product_pricing_id stored in schema.
 */

import type { Pool } from "pg";
import type { FormType } from "../types/forms.types";
import type {
  ExtractedPriceAffectingField,
  ExtractedProductLine,
} from "../types/extract-products.types";
import { getProductPricingForResolve } from "./pricing-forms.service";
import { resolvePrice } from "./pricing.service";

/** Possible row property codes for width/height (order of preference) */
const WIDTH_KEYS = ["ovl_sirka", "width", "Sirka", "sirka", "šířka"];
const HEIGHT_KEYS = ["ovl_vyska", "height", "Vyska", "vyska", "výška"];

function getDimension(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return String(v).trim();
  }
  return "";
}

/** Get section properties array from schema (zahlavi, form_body, zapati) */
function getSectionProperties(schemaSection: unknown): Array<Record<string, unknown>> {
  const sec = schemaSection as { Properties?: unknown[] } | undefined;
  if (!sec || !Array.isArray(sec.Properties)) return [];
  return sec.Properties as Array<Record<string, unknown>>;
}

/** Find property definition by Code across all sections (zahlavi, form_body, zapati) */
function findPropertyByCode(schema: Record<string, unknown>, code: string): Record<string, unknown> | null {
  const allSections = [
    getSectionProperties(schema.zahlavi),
    getSectionProperties(schema.form_body),
    getSectionProperties(schema.zapati),
  ];
  for (const props of allSections) {
    const found = props.find((p) => (p.Code as string) === code);
    if (found) return found;
  }
  return null;
}

/**
 * Resolve a human-friendly label for a schema property.
 * Falls back to the technical code when no name/title is available.
 */
function getPropertyLabel(propDef: Record<string, unknown> | null, code: string): string {
  if (!propDef) return code;
  const name = (propDef.Name as string | undefined)?.trim();
  if (name) return name;
  const title = (propDef.Title as string | undefined)?.trim();
  if (title) return title;
  return code;
}

/**
 * Resolve a human-friendly display value for a property based on schema enum metadata.
 * For non-enum or when metadata is missing, falls back to the raw stringified value.
 */
function getDisplayValueFromEnum(
  propDef: Record<string, unknown> | null,
  rawValue: unknown
): string {
  const rawStr = rawValue != null ? String(rawValue).trim() : "";
  if (!propDef || !rawStr) return rawStr;

  const dataType = propDef.DataType as string | undefined;
  if (dataType !== "enum") return rawStr;

  const enumValues = (propDef.EnumValues as Array<{ Code?: string; Name?: string }> | undefined) ?? [];
  if (!Array.isArray(enumValues) || enumValues.length === 0) return rawStr;

  const match = enumValues.find((item) => String(item.Code) === rawStr);
  if (!match) return rawStr;

  const name = (match.Name as string | undefined)?.trim();
  return name || rawStr;
}

/** Compute surcharge for one property based on its config, value, dimensions and quantity. */
function computeSurchargeForProperty(args: {
  cfg: Record<string, unknown>;
  propDef: Record<string, unknown> | null;
  rawValue: unknown;
  widthMm: number;
  heightMm: number;
  ks: number;
}): number {
  const { cfg, propDef, rawValue, widthMm, heightMm, ks } = args;
  if (!cfg || !propDef) return 0;

  const type = cfg.type as string | undefined;
  const dataType = propDef.DataType as string | undefined;
  const basisFrom = (basis: unknown, amount: unknown): number => {
    if (typeof amount !== "number" || amount === 0) return 0;
    const b = basis as string | undefined;
    if (b === "flat") return amount;
    if (b === "per_piece") return amount * (ks || 1);
    if (b === "per_m2") {
      const areaM2 = (widthMm * heightMm) / 1_000_000;
      if (!Number.isFinite(areaM2) || areaM2 <= 0) return 0;
      return amount * areaM2;
    }
    if (b === "per_width") return amount * widthMm;
    if (b === "per_height") return amount * heightMm;
    return 0;
  };

  if (type === "numeric" && dataType === "numeric") {
    const amount = cfg.amount as number | undefined;
    const onlyWhen = cfg.only_when_values as number[] | undefined;
    const valNum = Number(rawValue);
    if (Number.isNaN(valNum)) return 0;
    if (Array.isArray(onlyWhen) && onlyWhen.length > 0 && !onlyWhen.includes(valNum)) {
      return 0;
    }
    return basisFrom(cfg.basis, amount);
  }

  if (type === "boolean" && dataType === "boolean") {
    const boolVal = Boolean(rawValue);
    const branch = boolVal ? (cfg.price_if_true as Record<string, unknown> | null | undefined)
                           : (cfg.price_if_false as Record<string, unknown> | null | undefined);
    if (!branch) return 0;
    return basisFrom(branch.basis, branch.amount);
  }

  if (type === "enum" && dataType === "enum") {
    const currentCode = rawValue != null ? String(rawValue) : "";
    if (!currentCode) return 0;
    const perValue = cfg.per_value as Record<string, { basis?: string; amount?: number }> | undefined;
    const valueCfg = perValue ? perValue[currentCode] : undefined;
    if (!valueCfg || typeof valueCfg.amount !== "number") return 0;
    return basisFrom(valueCfg.basis, valueCfg.amount);
  }

  return 0;
}

/**
 * Build selector values from form row for price_affecting_enums.
 * All enum codes must be present in the row; otherwise throws (price cannot be resolved).
 */
function getSelectorValuesFromRow(
  row: Record<string, unknown>,
  priceAffectingEnums: string[],
  productName: string,
  dimStr: string
): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of priceAffectingEnums) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== "") {
      out[key] = String(v).trim();
    } else {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Cannot resolve price for "${productName}" (${dimStr}): missing price-affecting fields: ${missing.join(", ")}. ` +
        "Fill all variant options (e.g. type, color) in the form row."
    );
  }
  return out;
}

/**
 * Custom form: form_json is { schema, data }.
 * schema._product_pricing_id must be set (when form was created from catalog).
 * Prices are resolved from pricing DB via pricing_variant (selector + dimension_pricing).
 */
export async function extractFromCustom(
  formJson: Record<string, unknown>,
  pricingPool: Pool
): Promise<ExtractedProductLine[]> {
  const schema = formJson?.schema as Record<string, unknown> | undefined;
  const data = formJson?.data as Record<string, unknown> | undefined;
  if (!schema || !data) return [];

  const productPricingId =
    (schema._product_pricing_id as string) || (data.product_pricing_id as string);
  if (!productPricingId || typeof productPricingId !== "string") {
    throw new Error(
      "Form has no product_pricing_id (schema._product_pricing_id or data.product_pricing_id). " +
        "Create the form from catalog (Vybrat z katalogu) so pricing can be resolved from the pricing DB."
    );
  }

  const product = await getProductPricingForResolve(pricingPool, productPricingId);
  if (!product) {
    throw new Error(
      `Product pricing not found for id "${productPricingId}". It may have been removed or is not available for OVT.`
    );
  }

  const rooms = data?.rooms as Array<{ name?: string; rows?: Array<Record<string, unknown>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const productName =
    (data.productName as string) || (schema.product_code as string) || "Vlastní produkt";
  const lines: ExtractedProductLine[] = [];
  const priceAffectingEnums = product.price_affecting_enums || [];
  const surchargeConfigMap = (product.surcharges as Record<string, unknown> | null) ?? null;
  const surchargeProperties = (schema.surcharge_properties as string[] | undefined) ?? [];

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = getDimension(row, WIDTH_KEYS);
      const height = getDimension(row, HEIGHT_KEYS);
      const dimStr = [width, height].filter(Boolean).join("×") || "—";
      const produkt = `${productName} - ${dimStr}`;

      const selectorValues = getSelectorValuesFromRow(
        row,
        priceAffectingEnums,
        productName,
        dimStr
      );
      const cenaBase = await resolvePrice(
        pricingPool,
        productPricingId,
        selectorValues,
        width,
        height
      );
      let surchargeTotal = 0;
      const surchargeItems: Array<{ code: string; label?: string; amount: number }> = [];
      const surchargeWarnings: string[] = [];
      if (surchargeConfigMap && surchargeProperties.length > 0) {
        const widthMm = Number(width);
        const heightMm = Number(height);
        const ks = 1;
        for (const code of surchargeProperties) {
          const cfg = surchargeConfigMap[code] as Record<string, unknown> | undefined;
          if (!cfg) {
            surchargeWarnings.push(
              `Příplatek pro pole "${code}" není nakonfigurován v ceníku (surcharges).`
            );
            continue;
          }
          const propDef = findPropertyByCode(schema, code);
          if (!propDef) {
            surchargeWarnings.push(
              `Příplatek pro pole "${code}" byl nalezen v ceníku, ale pole v JSON schématu chybí.`
            );
          }
          const rawValue = (row as Record<string, unknown>)[code];
          const amount = computeSurchargeForProperty({
            cfg,
            propDef,
            rawValue,
            widthMm,
            heightMm,
            ks,
          });
          if (amount !== 0) {
            surchargeTotal += amount;
            surchargeItems.push({
              code,
              label: (propDef?.Name as string | undefined) ?? code,
              amount,
            });
          }
        }
      }
      const cenaWithSurcharges = cenaBase + surchargeTotal;
      const sleva = 0;
      const cenaPoSleve = Math.round(cenaWithSurcharges * (1 - sleva / 100));

      // Build human-friendly list of price-affecting fields for display in ADMF.
      const priceAffectingFields: ExtractedPriceAffectingField[] = [];
      for (const code of priceAffectingEnums) {
        const rawValue = (row as Record<string, unknown>)[code];
        const propDef = findPropertyByCode(schema, code);
        const label = getPropertyLabel(propDef, code);
        const value = getDisplayValueFromEnum(propDef, rawValue);
        if (value !== "") {
          priceAffectingFields.push({
            code,
            label,
            value,
          });
        }
      }

      lines.push({
        produkt,
        ks: 1,
        ram: (row.ram as string) ?? (row.frameColor as string) ?? "",
        lamelaLatka: (row.lamelaLatka as string) ?? (row.latka as string) ?? "",
        cena: cenaWithSurcharges,
        sleva,
        cenaPoSleve,
        baseCena: cenaBase,
        surcharges: surchargeItems.length > 0 ? surchargeItems : undefined,
        surchargeWarnings: surchargeWarnings.length > 0 ? surchargeWarnings : undefined,
        priceAffectingFields: priceAffectingFields.length > 0 ? priceAffectingFields : undefined,
      });
    }
  }
  return lines;
}

/** Run extractor for given form type (only custom supported). Requires pricingPool for custom. */
export async function extractProductsFromForm(
  formType: FormType,
  formJson: Record<string, unknown>,
  pricingPool: Pool
): Promise<ExtractedProductLine[]> {
  if (formType === "custom") {
    return extractFromCustom(formJson, pricingPool);
  }
  return [];
}
