/**
 * Admin pricing preview service. Powers POST /api/admin/calculate-price.
 *
 * Wraps the canonical pricing engine (pricing.service +
 * product-extractors.computeSurchargeForProperty) so the admin can:
 *   - calculate a price for a hypothetical product configuration
 *   - apply unsaved edits as `overrides` before resolving the variant
 *   - run with quantity ≠ 1 and an arbitrary surcharge selection set
 *
 * No I/O beyond loading product_pricing + pricing_variant rows from the
 * pricing DB. Pure where it can be (variant resolution, surcharge math).
 */

import type { Pool } from "pg";
import {
  resolveUnitPriceFromVariants,
  type ResolvePriceDetailedResult,
} from "./pricing.service";
import {
  getPricingVariantsByProductId,
  type PricingVariantRow,
} from "./pricing-forms.service";
import {
  computeSurchargeForProperty,
  findPropertyByCode,
} from "./product-extractors";

// ---------------------------------------------------------------------------
// Request / response contract
// ---------------------------------------------------------------------------

export interface CalculatePriceOverrides {
  /** Partial replacement of the fetched product_pricing row's editable fields. */
  product_pricing?: {
    payload?: Record<string, unknown>;
    price_affecting_enums?: string[];
    surcharges?: Record<string, unknown> | null;
  };
  /**
   * Variant overrides. Variants with an `id` matching an existing variant
   * replace it in-place; variants without an `id` are appended as new
   * candidates. To remove a variant, supply `_delete: true` alongside its id.
   */
  pricing_variants?: Array<{
    id?: string;
    selector: Record<string, string[]>;
    dimension_pricing?: { prices?: Record<string, number> } | null;
    surcharge_only?: boolean;
    _delete?: boolean;
  }>;
}

export interface CalculatePriceRequest {
  product_pricing_id: string;
  dimensions: { width_mm: number; height_mm: number };
  /** Default 1; surcharges with `per_piece` basis multiply by this. */
  quantity?: number;
  /** Selector values for price-affecting enums, e.g. { color: "203", type: "25" }. */
  enum_selections: Record<string, string>;
  /**
   * Values to drive surcharge computations, keyed by property Code. Only
   * properties listed here are evaluated (mirrors `surcharge_properties` on
   * a custom-form row schema).
   */
  surcharge_selections?: Record<string, unknown>;
  overrides?: CalculatePriceOverrides;
}

export interface CalculatePriceLineSurcharge {
  code: string;
  label?: string;
  amount: number;
}

export interface CalculatePriceResponse {
  matched: boolean;
  matched_variant: {
    id: string | null;
    selector: Record<string, string[]>;
    surcharge_only: boolean;
  } | null;
  /** Unit price from the dimension grid (0 for surcharge-only variants). */
  base_unit_price: number;
  /** Unit × ks. */
  base_line_price: number;
  /** Audit info for dimension snap-to-grid; null for surcharge-only variants. */
  dimensions: ResolvePriceDetailedResult["dimensions"];
  surcharges: CalculatePriceLineSurcharge[];
  surcharge_total: number;
  /** Line total bez DPH = base_line_price + surcharge_total. */
  cena: number;
  /** Non-fatal issues (missing surcharge config, schema gaps, etc.). */
  warnings: string[];
  /** When matched=false: human-readable reason. */
  unpriced_reason?: string;
}

// ---------------------------------------------------------------------------
// DB fetch (extended — includes payload for surcharge property lookup)
// ---------------------------------------------------------------------------

interface ProductPricingForPreview {
  id: string;
  payload: Record<string, unknown>;
  price_affecting_enums: string[];
  surcharges: Record<string, unknown> | null;
}

async function fetchProductPricingForPreview(
  pool: Pool,
  id: string
): Promise<ProductPricingForPreview | null> {
  const result = await pool.query(
    `SELECT id, payload, price_affecting_enums, surcharges
     FROM product_pricing
     WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;

  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : (() => {
          if (typeof row.payload === "string") {
            try {
              const parsed = JSON.parse(row.payload);
              return parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : {};
            } catch {
              return {};
            }
          }
          return {};
        })();

  const enumsRaw = row.price_affecting_enums;
  const priceAffectingEnums: string[] = Array.isArray(enumsRaw)
    ? enumsRaw
    : typeof enumsRaw === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(enumsRaw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const surcharges =
    row.surcharges && typeof row.surcharges === "object" && !Array.isArray(row.surcharges)
      ? (row.surcharges as Record<string, unknown>)
      : null;

  return {
    id: row.id,
    payload,
    price_affecting_enums: priceAffectingEnums,
    surcharges,
  };
}

// ---------------------------------------------------------------------------
// Override application — pure
// ---------------------------------------------------------------------------

function applyOverrides(
  product: ProductPricingForPreview,
  variants: PricingVariantRow[],
  overrides: CalculatePriceOverrides | undefined
): { product: ProductPricingForPreview; variants: PricingVariantRow[] } {
  if (!overrides) return { product, variants };

  let nextProduct = product;
  if (overrides.product_pricing) {
    const o = overrides.product_pricing;
    nextProduct = {
      ...product,
      payload: o.payload ?? product.payload,
      price_affecting_enums:
        o.price_affecting_enums ?? product.price_affecting_enums,
      surcharges: o.surcharges !== undefined ? o.surcharges : product.surcharges,
    };
  }

  let nextVariants = variants;
  if (overrides.pricing_variants && overrides.pricing_variants.length > 0) {
    const incoming = overrides.pricing_variants;
    const deletedIds = new Set(
      incoming.filter((v) => v._delete && v.id).map((v) => v.id as string)
    );
    const updates = new Map<string, PricingVariantRow>();
    const additions: PricingVariantRow[] = [];

    for (const v of incoming) {
      if (v._delete) continue;
      const row: PricingVariantRow = {
        id: v.id ?? `__draft_${additions.length}__`,
        selector: v.selector,
        dimension_pricing:
          v.dimension_pricing === undefined ? null : v.dimension_pricing,
        surcharge_only: v.surcharge_only === true,
      };
      if (v.id) updates.set(v.id, row);
      else additions.push(row);
    }

    nextVariants = variants
      .filter((existing) => !deletedIds.has(existing.id))
      .map((existing) => updates.get(existing.id) ?? existing);

    // Anything in updates that didn't replace an existing row gets appended.
    for (const [id, row] of updates.entries()) {
      if (!variants.some((v) => v.id === id)) nextVariants.push(row);
    }
    nextVariants.push(...additions);
  }

  return { product: nextProduct, variants: nextVariants };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const NOT_FOUND = "PRODUCT_PRICING_NOT_FOUND";

export async function calculatePricePreview(
  pricingPool: Pool,
  req: CalculatePriceRequest
): Promise<CalculatePriceResponse> {
  const liveProduct = await fetchProductPricingForPreview(
    pricingPool,
    req.product_pricing_id
  );
  if (!liveProduct) {
    throw Object.assign(new Error(`Product pricing not found: ${req.product_pricing_id}`), {
      code: NOT_FOUND,
    });
  }

  const liveVariants = await getPricingVariantsByProductId(
    pricingPool,
    req.product_pricing_id
  );

  const { product, variants } = applyOverrides(liveProduct, liveVariants, req.overrides);

  const ks = (() => {
    const n = Number(req.quantity);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.round(n);
  })();

  const widthMm = Math.max(0, Math.round(Number(req.dimensions?.width_mm) || 0));
  const heightMm = Math.max(0, Math.round(Number(req.dimensions?.height_mm) || 0));
  const widthStr = String(widthMm);
  const heightStr = String(heightMm);

  // Validate selector keys against (overridden) price_affecting_enums.
  const required = product.price_affecting_enums ?? [];
  const missing: string[] = [];
  for (const key of required) {
    const v = req.enum_selections?.[key];
    if (v === undefined || v === null || String(v).trim() === "") missing.push(key);
  }

  if (missing.length > 0) {
    return {
      matched: false,
      matched_variant: null,
      base_unit_price: 0,
      base_line_price: 0,
      dimensions: null,
      surcharges: [],
      surcharge_total: 0,
      cena: 0,
      warnings: [],
      unpriced_reason: `Chybí hodnoty pro pole ovlivňující cenu: ${missing.join(", ")}`,
    };
  }

  let resolved: ResolvePriceDetailedResult;
  try {
    resolved = resolveUnitPriceFromVariants({
      variants,
      selectorValues: req.enum_selections ?? {},
      width: widthStr,
      height: heightStr,
      productPricingIdForErrors: req.product_pricing_id,
    });
  } catch (e) {
    return {
      matched: false,
      matched_variant: null,
      base_unit_price: 0,
      base_line_price: 0,
      dimensions: null,
      surcharges: [],
      surcharge_total: 0,
      cena: 0,
      warnings: [],
      unpriced_reason: e instanceof Error ? e.message : "Cenu se nepodařilo vypočítat",
    };
  }

  const matchedVariant = variants.find((v) => v.id === resolved.pricing_variant_id) ?? null;
  const baseLinePrice = resolved.unitPrice * ks;

  // ------- surcharges --------
  const warnings: string[] = [];
  const surchargeItems: CalculatePriceLineSurcharge[] = [];
  let surchargeTotal = 0;
  const surchargeConfigMap = product.surcharges;
  const surchargeSelections = req.surcharge_selections ?? {};
  const surchargeCodes = Object.keys(surchargeSelections);

  if (surchargeCodes.length > 0 && !surchargeConfigMap) {
    warnings.push(
      "V ceníku není žádná surcharge konfigurace, přesto byly poslány hodnoty surcharge_selections."
    );
  }

  if (surchargeConfigMap) {
    for (const code of surchargeCodes) {
      const cfg = surchargeConfigMap[code] as Record<string, unknown> | undefined;
      if (!cfg) {
        warnings.push(`Příplatek pro pole "${code}" není v ceníku nakonfigurován.`);
        continue;
      }
      const propDef = findPropertyByCode(product.payload, code);
      if (!propDef) {
        warnings.push(
          `Příplatek "${code}" je v ceníku, ale pole chybí v payload schématu — typ nelze ověřit.`
        );
      }
      const rawValue = surchargeSelections[code];
      const currentBase = baseLinePrice + surchargeTotal;
      const amount = computeSurchargeForProperty({
        cfg,
        propDef,
        rawValue,
        widthMm,
        heightMm,
        ks,
        basePrice: currentBase,
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

  return {
    matched: true,
    matched_variant: matchedVariant
      ? {
          id: matchedVariant.id.startsWith("__draft_") ? null : matchedVariant.id,
          selector: matchedVariant.selector,
          surcharge_only: matchedVariant.surcharge_only === true,
        }
      : null,
    base_unit_price: resolved.unitPrice,
    base_line_price: baseLinePrice,
    dimensions: resolved.dimensions,
    surcharges: surchargeItems,
    surcharge_total: surchargeTotal,
    cena: baseLinePrice + surchargeTotal,
    warnings,
  };
}

export const ADMIN_PRICING_PREVIEW_ERRORS = {
  NOT_FOUND,
} as const;
