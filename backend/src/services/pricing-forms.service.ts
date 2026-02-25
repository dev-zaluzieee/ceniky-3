/**
 * Service for OVT-available forms from product_pricing (pricing database).
 * Only rows with available_for_ovt = true are considered.
 */

import type { Pool } from "pg";

/** One row from list endpoint (id, manufacturer, product_code; no heavy JSON) */
export interface PricingFormListItem {
  id: string;
  manufacturer: string;
  product_code: string;
}

/** Query params for listing OVT forms */
export interface ListPricingFormsQuery {
  manufacturer?: string;
  search?: string;
}

/**
 * List OVT-available forms with optional manufacturer and product_code search.
 * Uses ILIKE for product_code when search is provided.
 */
export async function listOvtForms(
  pool: Pool,
  query: ListPricingFormsQuery = {}
): Promise<PricingFormListItem[]> {
  const conditions: string[] = ["available_for_ovt = true"];
  const values: unknown[] = [];
  let idx = 1;

  if (query.manufacturer?.trim()) {
    conditions.push(`manufacturer = $${idx}`);
    values.push(query.manufacturer.trim());
    idx++;
  }
  if (query.search?.trim()) {
    conditions.push(`product_code ILIKE $${idx}`);
    values.push(`%${query.search.trim()}%`);
    idx++;
  }

  const sql = `
    SELECT id, manufacturer, product_code
    FROM product_pricing
    WHERE ${conditions.join(" AND ")}
    ORDER BY manufacturer, product_code
    LIMIT 200
  `;
  const result = await pool.query(sql, values);
  return result.rows.map((r) => ({
    id: r.id,
    manufacturer: r.manufacturer,
    product_code: r.product_code,
  }));
}

/** Single form with ovt_export_json for generating the custom form */
export interface PricingFormDetail {
  id: string;
  manufacturer: string;
  product_code: string;
  ovt_export_json: unknown;
}

/**
 * Get one OVT form by id. Returns ovt_export_json (snapshot for form generation).
 */
export async function getOvtFormById(pool: Pool, id: string): Promise<PricingFormDetail | null> {
  const result = await pool.query(
    `SELECT id, manufacturer, product_code, ovt_export_json
     FROM product_pricing
     WHERE id = $1 AND available_for_ovt = true`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    product_code: row.product_code,
    ovt_export_json: row.ovt_export_json,
  };
}

/**
 * Get distinct manufacturers that have at least one OVT-available form.
 */
export async function listOvtManufacturers(pool: Pool): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT manufacturer
     FROM product_pricing
     WHERE available_for_ovt = true
     ORDER BY manufacturer`
  );
  return result.rows.map((r) => r.manufacturer);
}

/** Product pricing row for price resolution (price_affecting_enums only) */
export interface ProductPricingForResolve {
  id: string;
  price_affecting_enums: string[];
}

/**
 * Get product_pricing by id for price resolution (price_affecting_enums).
 * Used to know which row fields to use as selector when resolving variant.
 */
export async function getProductPricingForResolve(
  pool: Pool,
  id: string
): Promise<ProductPricingForResolve | null> {
  const result = await pool.query(
    `SELECT id, price_affecting_enums FROM product_pricing WHERE id = $1 AND available_for_ovt = true`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  const enums = row.price_affecting_enums;
  const priceAffectingEnums: string[] = Array.isArray(enums)
    ? enums
    : typeof enums === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(enums);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return { id: row.id, price_affecting_enums: priceAffectingEnums };
}

/** Single pricing_variant row (selector + dimension_pricing for matching and price lookup) */
export interface PricingVariantRow {
  id: string;
  selector: Record<string, string[]>;
  dimension_pricing: { prices?: Record<string, number> };
}

/**
 * Get all pricing_variant rows for a product_pricing id.
 * Used to find the variant whose selector matches the form row's enum values.
 */
export async function getPricingVariantsByProductId(
  pool: Pool,
  productPricingId: string
): Promise<PricingVariantRow[]> {
  const result = await pool.query(
    `SELECT id, selector, dimension_pricing FROM pricing_variant WHERE product_pricing_id = $1`,
    [productPricingId]
  );
  return result.rows.map((r) => {
    let selector: Record<string, string[]> = {};
    if (r.selector && typeof r.selector === "object") {
      selector = r.selector as Record<string, string[]>;
    } else if (typeof r.selector === "string") {
      try {
        selector = JSON.parse(r.selector) as Record<string, string[]>;
      } catch {
        selector = {};
      }
    }
    let dimension_pricing: { prices?: Record<string, number> } = {};
    if (r.dimension_pricing && typeof r.dimension_pricing === "object") {
      dimension_pricing = r.dimension_pricing as { prices?: Record<string, number> };
    } else if (typeof r.dimension_pricing === "string") {
      try {
        dimension_pricing = JSON.parse(r.dimension_pricing) as { prices?: Record<string, number> };
      } catch {
        dimension_pricing = {};
      }
    }
    return { id: r.id, selector, dimension_pricing };
  });
}

/** Single size_limit_variant row for manufacturing/warranty range check */
export interface SizeLimitVariantRow {
  id: string;
  selector: Record<string, string[]>;
  mezni_sirka_min: number | null;
  mezni_sirka_max: number | null;
  mezni_vyska_min: number | null;
  mezni_vyska_max: number | null;
  zarucni_sirka_min: number | null;
  zarucni_sirka_max: number | null;
  zarucni_vyska_min: number | null;
  zarucni_vyska_max: number | null;
}

/**
 * Get all size_limit_variant rows for a product_pricing id.
 */
export async function getSizeLimitVariantsByProductId(
  pool: Pool,
  productPricingId: string
): Promise<SizeLimitVariantRow[]> {
  const result = await pool.query(
    `SELECT id, selector, mezni_sirka_min, mezni_sirka_max, mezni_vyska_min, mezni_vyska_max,
            zarucni_sirka_min, zarucni_sirka_max, zarucni_vyska_min, zarucni_vyska_max
     FROM size_limit_variant WHERE product_pricing_id = $1`,
    [productPricingId]
  );
  return result.rows.map((r) => {
    let selector: Record<string, string[]> = {};
    if (r.selector && typeof r.selector === "object") {
      selector = r.selector as Record<string, string[]>;
    } else if (typeof r.selector === "string") {
      try {
        selector = JSON.parse(r.selector) as Record<string, string[]>;
      } catch {
        selector = {};
      }
    }
    return {
      id: r.id,
      selector,
      mezni_sirka_min: r.mezni_sirka_min != null ? Number(r.mezni_sirka_min) : null,
      mezni_sirka_max: r.mezni_sirka_max != null ? Number(r.mezni_sirka_max) : null,
      mezni_vyska_min: r.mezni_vyska_min != null ? Number(r.mezni_vyska_min) : null,
      mezni_vyska_max: r.mezni_vyska_max != null ? Number(r.mezni_vyska_max) : null,
      zarucni_sirka_min: r.zarucni_sirka_min != null ? Number(r.zarucni_sirka_min) : null,
      zarucni_sirka_max: r.zarucni_sirka_max != null ? Number(r.zarucni_sirka_max) : null,
      zarucni_vyska_min: r.zarucni_vyska_min != null ? Number(r.zarucni_vyska_min) : null,
      zarucni_vyska_max: r.zarucni_vyska_max != null ? Number(r.zarucni_vyska_max) : null,
    };
  });
}
