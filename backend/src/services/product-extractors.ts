/**
 * Product extractors: turn step 1 form form_json into product lines for ADMF.
 * Prices are resolved from pricing DB (pricing_variant) using product_pricing_id stored in schema.
 */

import type { Pool } from "pg";
import type { FormType } from "../types/forms.types";
import type {
  AdmfPricingTraceAutomatedV1,
  AdmfPricingTraceV1,
  ExtractedPriceAffectingField,
  ExtractedProductLine,
} from "../types/extract-products.types";
import { getProductPricingForResolve } from "./pricing-forms.service";
import { resolvePriceDetailed } from "./pricing.service";

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
  /**
   * Base price used for percent surcharges.
   * Interpreted as the current line base before applying this surcharge.
   */
  basePrice: number;
}): number {
  const { cfg, propDef, rawValue, widthMm, heightMm, ks, basePrice } = args;
  if (!cfg || !propDef) return 0;

  const type = cfg.type as string | undefined;
  const dataType = propDef.DataType as string | undefined;
  const basisFrom = (basis: unknown, amount: unknown): number => {
    if (typeof amount !== "number" || amount === 0) return 0;
    const b = basis as string | undefined;
    if (b === "percent_base") {
      if (!Number.isFinite(basePrice)) return 0;
      return basePrice * (amount / 100);
    }
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
 * Flatten a persisted row: supports new `{ product_pricing_id, values }` or legacy flat row object.
 */
/** Human label for one row’s product (mirrors frontend `resolveProductNameFromPayload`). */
function displayNameFromRowSchema(rowSchema: Record<string, unknown>): string {
  const pick = (v: unknown): string => {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    return "";
  };
  const fb = rowSchema.form_body as { Name?: string } | undefined;
  const zh = rowSchema.zahlavi as { Name?: string } | undefined;
  const zp = rowSchema.zapati as { Name?: string } | undefined;
  const code = typeof rowSchema.product_code === "string" ? rowSchema.product_code.trim() : "";
  return pick(fb?.Name) || pick(zh?.Name) || pick(zp?.Name) || (code || "Vlastní produkt");
}

function flattenRowForExtract(row: Record<string, unknown>): Record<string, unknown> {
  const values = row.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    const v = values as Record<string, unknown>;
    const out: Record<string, unknown> = { ...v };
    if (row.linkGroupId !== undefined) out.linkGroupId = row.linkGroupId;
    return out;
  }
  return row;
}

interface ResolvedCustomRowPricingCore {
  productName: string;
  dimStr: string;
  produkt: string;
  ks: number;
  selectorValues: Record<string, string>;
  unit_price_grid: number;
  pricing_variant_id: string;
  dimensions: AdmfPricingTraceAutomatedV1["dimensions"];
  surcharge_only?: boolean;
  line_base: number;
  surcharge_total: number;
  surcharges: Array<{ code: string; label?: string; amount: number }>;
  surcharge_warnings: string[];
  cena: number;
  sleva: number;
  cenaPoSleve: number;
}

async function resolveCustomRowPricingCore(args: {
  pricingPool: Pool;
  rowSchema: Record<string, unknown>;
  flatRow: Record<string, unknown>;
  productPricingId: string;
}): Promise<ResolvedCustomRowPricingCore> {
  const { pricingPool, rowSchema, flatRow, productPricingId } = args;
  const product = await getProductPricingForResolve(pricingPool, productPricingId);
  if (!product) {
    throw new Error(
      `Product pricing not found for id "${productPricingId}". It may have been removed or is not available for OVT.`
    );
  }

  const productName = displayNameFromRowSchema(rowSchema);
  const width = getDimension(flatRow, WIDTH_KEYS);
  const height = getDimension(flatRow, HEIGHT_KEYS);
  const dimStr = [width, height].filter(Boolean).join("×") || "—";
  const produkt = `${productName} - ${dimStr}`;

  const ksRaw = flatRow.ks ?? flatRow.kus ?? flatRow.count ?? flatRow.quantity;
  const ks = (() => {
    const n = Number(ksRaw);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.round(n);
  })();

  const priceAffectingEnums = product.price_affecting_enums || [];
  const selectorValues = getSelectorValuesFromRow(flatRow, priceAffectingEnums, productName, dimStr);
  const surchargeConfigMap = (product.surcharges as Record<string, unknown> | null) ?? null;
  const surchargeProperties = (rowSchema.surcharge_properties as string[] | undefined) ?? [];

  const {
    unitPrice: unitCenaBase,
    pricing_variant_id,
    dimensions,
    surcharge_only: variantSurchargeOnly,
  } = await resolvePriceDetailed(pricingPool, productPricingId, selectorValues, width, height);

  const cenaBase = unitCenaBase * ks;
  let surchargeTotal = 0;
  const surchargeItems: Array<{ code: string; label?: string; amount: number }> = [];
  const surchargeWarnings: string[] = [];
  if (surchargeConfigMap && surchargeProperties.length > 0) {
    const widthMm = Number(width);
    const heightMm = Number(height);
    for (const code of surchargeProperties) {
      const cfg = surchargeConfigMap[code] as Record<string, unknown> | undefined;
      if (!cfg) {
        surchargeWarnings.push(
          `Příplatek pro pole "${code}" není nakonfigurován v ceníku (surcharges).`
        );
        continue;
      }
      const propDef = findPropertyByCode(rowSchema, code);
      if (!propDef) {
        surchargeWarnings.push(
          `Příplatek pro pole "${code}" byl nalezen v ceníku, ale pole v JSON schématu chybí.`
        );
      }
      const rawValue = flatRow[code];
      const currentBaseBeforeSurcharge = cenaBase + surchargeTotal;
      const amount = computeSurchargeForProperty({
        cfg,
        propDef,
        rawValue,
        widthMm,
        heightMm,
        ks,
        basePrice: currentBaseBeforeSurcharge,
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

  return {
    productName,
    dimStr,
    produkt,
    ks,
    selectorValues,
    unit_price_grid: unitCenaBase,
    pricing_variant_id,
    dimensions,
    ...(variantSurchargeOnly && { surcharge_only: true }),
    line_base: cenaBase,
    surcharge_total: surchargeTotal,
    surcharges: surchargeItems,
    surcharge_warnings: surchargeWarnings,
    cena: cenaWithSurcharges,
    sleva,
    cenaPoSleve,
  };
}

export interface CustomRowPricePreview {
  product_name: string;
  dimensions_label: string;
  quantity: number;
  unit_price_grid: number;
  line_base: number;
  surcharge_total: number;
  final_price: number;
  pricing_variant_id: string;
  surcharge_only?: boolean;
  surcharges?: Array<{ code: string; label?: string; amount: number }>;
  surcharge_warnings?: string[];
}

export async function previewCustomRowPrice(args: {
  pricingPool: Pool;
  rowSchema: Record<string, unknown>;
  rowValues: Record<string, unknown>;
  productPricingId: string;
}): Promise<CustomRowPricePreview> {
  const resolved = await resolveCustomRowPricingCore({
    pricingPool: args.pricingPool,
    rowSchema: args.rowSchema,
    flatRow: args.rowValues,
    productPricingId: args.productPricingId,
  });

  return {
    product_name: resolved.productName,
    dimensions_label: resolved.dimStr,
    quantity: resolved.ks,
    unit_price_grid: resolved.unit_price_grid,
    line_base: resolved.line_base,
    surcharge_total: resolved.surcharge_total,
    final_price: resolved.cena,
    pricing_variant_id: resolved.pricing_variant_id,
    ...(resolved.surcharge_only && { surcharge_only: true }),
    ...(resolved.surcharges.length > 0 && { surcharges: resolved.surcharges }),
    ...(resolved.surcharge_warnings.length > 0 && { surcharge_warnings: resolved.surcharge_warnings }),
  };
}

/**
 * Custom form: `form_json` is `{ schema, product_schemas?, data }`.
 * Each row references `product_pricing_id` and optional `product_schemas[id]` for row-level schema;
 * falls back to top-level `schema` when `product_schemas` is missing (legacy).
 */
export async function extractFromCustom(
  formJson: Record<string, unknown>,
  pricingPool: Pool,
  sourceFormId: number
): Promise<ExtractedProductLine[]> {
  const schemaTop = formJson?.schema as Record<string, unknown> | undefined;
  const data = formJson?.data as Record<string, unknown> | undefined;
  if (!schemaTop || !data) return [];

  const productSchemasRaw = formJson.product_schemas as Record<string, Record<string, unknown>> | undefined;
  const productSchemas: Record<string, Record<string, unknown>> =
    productSchemasRaw && typeof productSchemasRaw === "object" ? productSchemasRaw : {};

  const rooms = data?.rooms as Array<{ name?: string; rows?: Array<Record<string, unknown>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const lines: ExtractedProductLine[] = [];

  for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
    const room = rooms[roomIndex];
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const rawRow = rows[rowIndex];
      const flatRow = flattenRowForExtract(rawRow);

      const rowPricingIdRaw =
        (rawRow.product_pricing_id as string) ||
        (typeof flatRow.product_pricing_id === "string" ? flatRow.product_pricing_id : undefined);
      const productPricingId =
        rowPricingIdRaw?.trim() ||
        (schemaTop._product_pricing_id as string) ||
        (data.product_pricing_id as string);
      if (!productPricingId || typeof productPricingId !== "string") {
        throw new Error(
          "A form row has no product_pricing_id. Pick a catalog product for each row (or create the form from katalog)."
        );
      }

      const rowSchema =
        productSchemas[productPricingId] ?? (productPricingId === schemaTop._product_pricing_id ? schemaTop : undefined);
      if (!rowSchema) {
        throw new Error(
          `Missing product_schemas entry for "${productPricingId}". Save the form again from OVT so schemas are stored.`
        );
      }

      const resolved = await resolveCustomRowPricingCore({
        pricingPool,
        rowSchema,
        flatRow,
        productPricingId,
      });
      const resolvedAt = new Date().toISOString();

      const automated: AdmfPricingTraceAutomatedV1 = {
        resolved_at: resolvedAt,
        product_pricing_id: productPricingId,
        source_form_id: sourceFormId,
        room_name: typeof room?.name === "string" ? room.name : undefined,
        room_index: roomIndex,
        row_index: rowIndex,
        dimensions: resolved.dimensions,
        pricing_variant_id: resolved.pricing_variant_id,
        ...(resolved.surcharge_only && { surcharge_only: true }),
        selector_applied: { ...resolved.selectorValues },
        unit_price_grid: resolved.unit_price_grid,
        ks: resolved.ks,
        line_base: resolved.line_base,
        surcharge_total: resolved.surcharge_total,
        surcharges: resolved.surcharges.length > 0 ? resolved.surcharges : undefined,
        surcharge_warnings: resolved.surcharge_warnings.length > 0 ? resolved.surcharge_warnings : undefined,
        cena: resolved.cena,
        sleva: resolved.sleva,
        cenaPoSleve: resolved.cenaPoSleve,
      };

      const pricingTrace: AdmfPricingTraceV1 = {
        trace_version: 1,
        automated,
        manual_edits: undefined,
      };

      const product = await getProductPricingForResolve(pricingPool, productPricingId);
      const priceAffectingEnums = product?.price_affecting_enums || [];
      const priceAffectingFields: ExtractedPriceAffectingField[] = [];
      for (const code of priceAffectingEnums) {
        const rawValue = flatRow[code];
        const propDef = findPropertyByCode(rowSchema, code);
        const label = getPropertyLabel(propDef, code);
        const value = getDisplayValueFromEnum(propDef, rawValue);
        priceAffectingFields.push({
          code,
          label,
          value,
        });
      }

      lines.push({
        produkt: resolved.produkt,
        ks: resolved.ks,
        cena: resolved.cena,
        sleva: resolved.sleva,
        cenaPoSleve: resolved.cenaPoSleve,
        baseCena: resolved.line_base,
        surcharges: resolved.surcharges.length > 0 ? resolved.surcharges : undefined,
        surchargeWarnings: resolved.surcharge_warnings.length > 0 ? resolved.surcharge_warnings : undefined,
        priceAffectingFields: priceAffectingFields.length > 0 ? priceAffectingFields : undefined,
        pricingTrace,
      });
    }
  }
  return lines;
}

/**
 * Run extractor for given form type (only custom supported). Requires pricingPool for custom.
 * @param sourceFormId - DB id of the custom form (stored in pricing trace).
 */
export async function extractProductsFromForm(
  formType: FormType,
  formJson: Record<string, unknown>,
  pricingPool: Pool,
  sourceFormId: number
): Promise<ExtractedProductLine[]> {
  if (formType === "custom") {
    return extractFromCustom(formJson, pricingPool, sourceFormId);
  }
  return [];
}
