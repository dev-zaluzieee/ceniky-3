/**
 * Size limits resolution from pricing DB (size_limit_variant).
 * Matches variant by selector (same as pricing_variant), returns manufacturing and warranty ranges
 * and whether the given width/height are inside them.
 */

import type { Pool } from "pg";
import {
  getProductPricingForResolve,
  getSizeLimitVariantsByProductId,
  type SizeLimitVariantRow,
} from "./pricing-forms.service";

function findMatchingVariant(
  variants: SizeLimitVariantRow[],
  selectorValues: Record<string, string>
): SizeLimitVariantRow | null {
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

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export interface ResolveSizeLimitsResult {
  mezni_sirka_min: number | null;
  mezni_sirka_max: number | null;
  mezni_vyska_min: number | null;
  mezni_vyska_max: number | null;
  zarucni_sirka_min: number | null;
  zarucni_sirka_max: number | null;
  zarucni_vyska_min: number | null;
  zarucni_vyska_max: number | null;
  in_manufacturing_range: boolean;
  in_warranty_range: boolean;
}

/**
 * Resolve size limits for a product row. Finds matching size_limit_variant by selector,
 * then checks if width/height are inside manufacturing and warranty ranges.
 * If no matching variant, returns in_manufacturing_range: true, in_warranty_range: true (no restriction).
 */
export async function resolveSizeLimits(
  pool: Pool,
  productPricingId: string,
  selectorValues: Record<string, string>,
  width: number,
  height: number
): Promise<ResolveSizeLimitsResult> {
  const product = await getProductPricingForResolve(pool, productPricingId);
  if (!product) {
    return {
      mezni_sirka_min: null,
      mezni_sirka_max: null,
      mezni_vyska_min: null,
      mezni_vyska_max: null,
      zarucni_sirka_min: null,
      zarucni_sirka_max: null,
      zarucni_vyska_min: null,
      zarucni_vyska_max: null,
      in_manufacturing_range: true,
      in_warranty_range: true,
    };
  }

  const variants = await getSizeLimitVariantsByProductId(pool, productPricingId);
  if (variants.length === 0) {
    return {
      mezni_sirka_min: null,
      mezni_sirka_max: null,
      mezni_vyska_min: null,
      mezni_vyska_max: null,
      zarucni_sirka_min: null,
      zarucni_sirka_max: null,
      zarucni_vyska_min: null,
      zarucni_vyska_max: null,
      in_manufacturing_range: true,
      in_warranty_range: true,
    };
  }

  const variant = findMatchingVariant(variants, selectorValues);
  if (!variant) {
    return {
      mezni_sirka_min: null,
      mezni_sirka_max: null,
      mezni_vyska_min: null,
      mezni_vyska_max: null,
      zarucni_sirka_min: null,
      zarucni_sirka_max: null,
      zarucni_vyska_min: null,
      zarucni_vyska_max: null,
      in_manufacturing_range: true,
      in_warranty_range: true,
    };
  }

  const mwMin = toNum(variant.mezni_sirka_min);
  const mwMax = toNum(variant.mezni_sirka_max);
  const mhMin = toNum(variant.mezni_vyska_min);
  const mhMax = toNum(variant.mezni_vyska_max);
  const zwMin = toNum(variant.zarucni_sirka_min);
  const zwMax = toNum(variant.zarucni_sirka_max);
  const zhMin = toNum(variant.zarucni_vyska_min);
  const zhMax = toNum(variant.zarucni_vyska_max);

  const inManufacturing =
    mwMin != null && mwMax != null && mhMin != null && mhMax != null &&
    width >= mwMin && width <= mwMax && height >= mhMin && height <= mhMax;
  const inWarranty =
    zwMin != null && zwMax != null && zhMin != null && zhMax != null &&
    width >= zwMin && width <= zwMax && height >= zhMin && height <= zhMax;

  return {
    mezni_sirka_min: mwMin,
    mezni_sirka_max: mwMax,
    mezni_vyska_min: mhMin,
    mezni_vyska_max: mhMax,
    zarucni_sirka_min: zwMin,
    zarucni_sirka_max: zwMax,
    zarucni_vyska_min: zhMin,
    zarucni_vyska_max: zhMax,
    in_manufacturing_range: inManufacturing,
    in_warranty_range: inWarranty,
  };
}
