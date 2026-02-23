/**
 * Product extractors: turn step 1 form form_json into product lines for ADMF.
 * Prices are resolved from pricing DB (pricing_variant) using product_pricing_id stored in schema.
 */

import type { Pool } from "pg";
import type { FormType } from "../types/forms.types";
import type { ExtractedProductLine } from "../types/extract-products.types";
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
      const cena = await resolvePrice(
        pricingPool,
        productPricingId,
        selectorValues,
        width,
        height
      );
      const sleva = 0;
      const cenaPoSleve = Math.round(cena * (1 - sleva / 100));

      lines.push({
        produkt,
        ks: 1,
        ram: (row.ram as string) ?? (row.frameColor as string) ?? "",
        lamelaLatka: (row.lamelaLatka as string) ?? (row.latka as string) ?? "",
        cena,
        sleva,
        cenaPoSleve,
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
