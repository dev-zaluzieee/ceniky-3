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
