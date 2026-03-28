/**
 * Pricing service – resolves price from pricing DB (pricing_variant) or throws.
 * Form must have been created from catalog (product_pricing_id stored).
 */

import type { Pool } from "pg";
import type {
  AdmfPricingTraceDimensionsV1,
  ExtractedProductLine,
} from "../types/extract-products.types";
import {
  getProductPricingForResolve,
  getPricingVariantsByProductId,
  type PricingVariantRow,
} from "./pricing-forms.service";

/**
 * Build dimension grid key from width/height.
 * Note: pricing tool stores prices as prices["height_width"], so we intentionally
 * flip the order here to match that convention.
 */
function ceilTo100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

function dimensionKey(width: number, height: number): string {
  // Key format expected by pricing tool: "<height>_<width>"
  return `${height}_${width}`;
}

function toDimensionValues(width: string, height: string): { w: number; h: number } {
  return {
    w: ceilTo100(Math.round(Number(width) || 0)),
    h: ceilTo100(Math.round(Number(height) || 0)),
  };
}

/**
 * Snap width and height independently to the nearest available value in the price table.
 * Below table minimum → use minimum; above table maximum → use maximum;
 * between two steps → use the step with the smaller distance (tie: use the higher step).
 */
function clampToPriceTable(
  w: number,
  h: number,
  prices: Record<string, number>
): { w: number; h: number } {
  const widths = new Set<number>();
  const heights = new Set<number>();
  for (const key of Object.keys(prices)) {
    const parts = key.split("_");
    if (parts.length !== 2) continue;
    const kh = Number(parts[0]);
    const kw = Number(parts[1]);
    if (!Number.isNaN(kh)) heights.add(kh);
    if (!Number.isNaN(kw)) widths.add(kw);
  }
  if (widths.size === 0 || heights.size === 0) return { w, h };

  const sortedW = Array.from(widths).sort((a, b) => a - b);
  const sortedH = Array.from(heights).sort((a, b) => a - b);

  /** Pick the nearest value in sorted array; if tied, use the higher value. */
  const snapToNearest = (val: number, sorted: number[]): number => {
    if (val <= sorted[0]) return sorted[0];
    if (val >= sorted[sorted.length - 1]) return sorted[sorted.length - 1];
    const i = sorted.findIndex((x) => x >= val);
    const lo = sorted[i - 1];
    const hi = sorted[i];
    const dLo = val - lo;
    const dHi = hi - val;
    return dHi <= dLo ? hi : lo;
  };

  return { w: snapToNearest(w, sortedW), h: snapToNearest(h, sortedH) };
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

/** Result of grid lookup: unit price plus audit dimensions. */
export interface ResolvePriceDetailedResult {
  unitPrice: number;
  pricing_variant_id: string;
  /** Null for surcharge-only variants (no dimension grid). */
  dimensions: AdmfPricingTraceDimensionsV1 | null;
  /** When true, matched variant is surcharge-only (no dimension grid). */
  surcharge_only?: boolean;
}

/**
 * Resolve unit price from pricing DB for a product row, with full dimension/variant audit data.
 * Uses product_pricing_id + row's enum values (selector) to find pricing_variant, then dimension_pricing.prices.
 */
export async function resolvePriceDetailed(
  pool: Pool,
  productPricingId: string,
  selectorValues: Record<string, string>,
  width: string,
  height: string
): Promise<ResolvePriceDetailedResult> {
  const product = await getProductPricingForResolve(pool, productPricingId);
  if (!product) {
    throw new Error(
      `Product pricing not found for id "${productPricingId}". Form may not have been created from catalog.`
    );
  }

  const variants = await getPricingVariantsByProductId(pool, productPricingId);
  if (variants.length === 0) {
    throw new Error(`No pricing variants found for product_pricing_id "${productPricingId}".`);
  }

  const variant = findMatchingVariant(variants, selectorValues);
  if (!variant) {
    const selStr = JSON.stringify(selectorValues);
    throw new Error(
      `No pricing variant matches selector ${selStr} for product_pricing_id "${productPricingId}". ` +
        "Check that the form row has values for all price_affecting_enums."
    );
  }

  // Surcharge-only variant: no dimension grid, unit price is 0.
  if (variant.surcharge_only) {
    return {
      unitPrice: 0,
      pricing_variant_id: variant.id,
      dimensions: null,
      surcharge_only: true,
    };
  }

  const prices = variant.dimension_pricing?.prices;
  if (!prices || typeof prices !== "object") {
    throw new Error(`Variant ${variant.id} has no dimension_pricing.prices.`);
  }

  const inputWidthMm = Math.round(Number(width) || 0);
  const inputHeightMm = Math.round(Number(height) || 0);
  const dims = toDimensionValues(width, height);
  let lookupW = dims.w;
  let lookupH = dims.h;
  let key = dimensionKey(dims.w, dims.h);
  let cena = prices[key];
  let usedSnap = false;

  if (typeof cena !== "number" || cena < 0) {
    const snapped = clampToPriceTable(dims.w, dims.h, prices);
    lookupW = snapped.w;
    lookupH = snapped.h;
    key = dimensionKey(snapped.w, snapped.h);
    cena = prices[key];
    usedSnap = snapped.w !== dims.w || snapped.h !== dims.h;
  }

  if (typeof cena !== "number" || cena < 0) {
    throw new Error(
      `No price for dimensions ${width}×${height} (key "${key}") in variant ${variant.id}.`
    );
  }

  const dimensions: AdmfPricingTraceDimensionsV1 = {
    raw_width: width,
    raw_height: height,
    input_width_mm: inputWidthMm,
    input_height_mm: inputHeightMm,
    width_mm_ceiled: dims.w,
    height_mm_ceiled: dims.h,
    lookup_width_mm: lookupW,
    lookup_height_mm: lookupH,
    used_dimension_snap: usedSnap,
    price_key: key,
  };

  return {
    unitPrice: cena,
    pricing_variant_id: variant.id,
    dimensions,
  };
}

/**
 * Get unit price for a product line (legacy fallback).
 * Throws – prices come from `resolvePriceDetailed` / pricing DB.
 */
export function getPriceForProduct(
  product: Omit<ExtractedProductLine, "cena" | "sleva" | "cenaPoSleve">
): number {
  throw new Error(
    `Price not available for product "${product.produkt}". ` +
      "Form must be created from catalog and have product_pricing_id; price is resolved from pricing DB."
  );
}
