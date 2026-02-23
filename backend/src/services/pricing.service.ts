/**
 * Pricing service – resolves price from pricing DB (pricing_variant) or throws.
 * No mock or random values. Form must have been created from catalog (product_pricing_id stored).
 */

import type { Pool } from "pg";
import type { ExtractedProductLine } from "../types/extract-products.types";
import {
  getProductPricingForResolve,
  getPricingVariantsByProductId,
  type PricingVariantRow,
} from "./pricing-forms.service";

/** Build dimension grid key from width/height (e.g. "400_500") */
function dimensionKey(width: string, height: string): string {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  return `${w}_${h}`;
}

/**
 * Find variant whose selector matches the given selector values.
 * For each key in selectorValues, variant.selector[key] must contain selectorValues[key].
 */
function findMatchingVariant(
  variants: PricingVariantRow[],
  selectorValues: Record<string, string>
): PricingVariantRow | null {
  for (const variant of variants) {
    let matches = true;
    for (const [key, value] of Object.entries(selectorValues)) {
      const allowed = variant.selector[key];
      if (!Array.isArray(allowed) || !allowed.includes(String(value))) {
        matches = false;
        break;
      }
    }
    if (matches) return variant;
  }
  return null;
}

/**
 * Resolve unit price from pricing DB for a product row.
 * Uses product_pricing_id + row's enum values (selector) to find pricing_variant, then dimension_pricing.prices[width_height].
 * @param pool - Pricing DB pool (PRICING_DATABASE_URL)
 * @param productPricingId - product_pricing.id (must be stored in form when created from catalog)
 * @param selectorValues - e.g. { type: "25", color: "203" } from form row
 * @param width - width dimension (e.g. "400")
 * @param height - height dimension (e.g. "500")
 * @returns unit price (cena)
 */
export async function resolvePrice(
  pool: Pool,
  productPricingId: string,
  selectorValues: Record<string, string>,
  width: string,
  height: string
): Promise<number> {
  const product = await getProductPricingForResolve(pool, productPricingId);
  if (!product) {
    throw new Error(
      `Product pricing not found for id "${productPricingId}". Form may not have been created from catalog.`
    );
  }

  const variants = await getPricingVariantsByProductId(pool, productPricingId);
  if (variants.length === 0) {
    throw new Error(
      `No pricing variants found for product_pricing_id "${productPricingId}".`
    );
  }

  const variant = findMatchingVariant(variants, selectorValues);
  if (!variant) {
    const selStr = JSON.stringify(selectorValues);
    throw new Error(
      `No pricing variant matches selector ${selStr} for product_pricing_id "${productPricingId}". ` +
        "Check that the form row has values for all price_affecting_enums."
    );
  }

  const key = dimensionKey(width, height);
  const prices = variant.dimension_pricing?.prices;
  if (!prices || typeof prices !== "object") {
    throw new Error(
      `Variant ${variant.id} has no dimension_pricing.prices.`
    );
  }
  const cena = prices[key];
  if (typeof cena !== "number" || cena < 0) {
    throw new Error(
      `No price for dimensions ${width}×${height} (key "${key}") in variant ${variant.id}.`
    );
  }
  return cena;
}

/**
 * Get unit price for a product line (legacy fallback).
 * Throws – use resolvePrice from pricing DB instead.
 */
export function getPriceForProduct(
  product: Omit<ExtractedProductLine, "cena" | "sleva" | "cenaPoSleve">
): number {
  throw new Error(
    `Price not available for product "${product.produkt}". ` +
      "Form must be created from catalog and have product_pricing_id; price is resolved from pricing DB."
  );
}
