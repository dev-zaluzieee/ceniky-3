/**
 * Product extractors: turn step 1 form form_json into product lines for ADMF.
 * Only custom form type: extracts from custom form { schema, data } using schema.pricing when available.
 */

import type { FormType } from "../types/forms.types";
import type { ExtractedProductLine } from "../types/extract-products.types";

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

/** Build dimension grid key from width/height (e.g. "400_500"); normalizes to integer string */
function dimensionKey(width: string, height: string): string {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  return `${w}_${h}`;
}

/**
 * Get price from custom schema pricing grid if available.
 * pricing.dimension_grid.prices has keys like "400_400", "400_500" (width_height).
 */
function getPriceFromSchema(
  schema: Record<string, unknown>,
  width: string,
  height: string
): number | undefined {
  const pricing = schema?.pricing as Record<string, unknown> | undefined;
  const grid = pricing?.dimension_grid as Record<string, unknown> | undefined;
  const prices = grid?.prices as Record<string, number> | undefined;
  if (!prices || typeof prices !== "object") return undefined;
  const key = dimensionKey(width, height);
  const cena = prices[key];
  if (typeof cena === "number" && cena >= 0) return cena;
  return undefined;
}

/**
 * Custom form: form_json is { schema, data }.
 * data.rooms[].rows[] – each row has dynamic keys from form_body.
 * Extract one product per row; use schema.pricing.dimension_grid.prices[width_height] when available.
 */
export function extractFromCustom(formJson: Record<string, unknown>): ExtractedProductLine[] {
  const schema = formJson?.schema as Record<string, unknown> | undefined;
  const data = formJson?.data as Record<string, unknown> | undefined;
  if (!schema || !data) return [];

  const rooms = data?.rooms as Array<{ name?: string; rows?: Array<Record<string, unknown>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const productName =
    (data.productName as string) || (schema.product_code as string) || "Vlastní produkt";
  const lines: ExtractedProductLine[] = [];

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = getDimension(row, WIDTH_KEYS);
      const height = getDimension(row, HEIGHT_KEYS);
      const dimStr = [width, height].filter(Boolean).join("×") || "—";
      const produkt = `${productName} - ${dimStr}`;

      const priceFromSchema = getPriceFromSchema(schema, width, height);
      if (priceFromSchema === undefined) {
        const dimKey = [width, height].filter(Boolean).join("×") || "?";
        throw new Error(
          `No price in schema for product "${productName}", dimensions ${dimKey}. ` +
            "Ensure schema.pricing.dimension_grid.prices contains an entry for this width×height (e.g. key \"400_500\")."
        );
      }
      const cena = priceFromSchema;
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

/** Run extractor for given form type (only custom supported). */
export function extractProductsFromForm(
  formType: FormType,
  formJson: Record<string, any>
): ExtractedProductLine[] {
  if (formType === "custom") {
    return extractFromCustom(formJson as Record<string, unknown>);
  }
  return [];
}
