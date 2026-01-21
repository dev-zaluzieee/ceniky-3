/**
 * ERP customers queries (data access layer).
 * Uses a read-only replica in ERP database.
 */

import { erpDb } from "../services/erp-db.client";
import { ErpCustomer } from "../types/erp.types";
import { InternalServerError } from "../utils/errors";

/**
 * Normalize a phone number into digits-only string.
 * Keeps only 0-9 characters.
 */
function toDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Search ERP customers by phone using LIKE against digits-only phone.
 *
 * Since phone formats vary (+420..., spaces, etc.), we:
 * - normalize input to digits
 * - assume mostly Czech numbers and use last 9 digits for matching (suffix match)
 * - perform SQL LIKE on normalized phone in DB using regexp_replace
 *
 * @param rawPhone - phone number from user input
 * @returns list of ERP customers candidates (may be empty)
 */
export async function searchErpCustomersByPhoneLike(rawPhone: string): Promise<ErpCustomer[]> {
  try {
    await erpDb.initialize();

    const digits = toDigitsOnly(rawPhone);
    const needle = digits.length > 9 ? digits.slice(-9) : digits;

    // NOTE: regexp_replace prevents index use, but perf is acceptable per requirements.
    // Parameterized query to avoid SQL injection.
    const sql = `
      SELECT
        id,
        name,
        email,
        phone,
        address,
        city,
        city_part,
        region,
        zipcode,
        created_at::text AS created_at,
        updated_at::text AS updated_at
      FROM customers
      WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 50
    `;

    const likeParam = `%${needle}%`;
    const result = await erpDb.query<ErpCustomer>(sql, [likeParam]);
    return result.rows ?? [];
  } catch (error: any) {
    // Wrap non-ApiError errors to keep consistent API surface.
    if (error?.statusCode) throw error;
    throw new InternalServerError(`Failed to search ERP customers: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Fetch a single ERP customer by ID.
 * @param id - ERP customer id
 */
export async function getErpCustomerById(id: number): Promise<ErpCustomer | null> {
  try {
    await erpDb.initialize();

    const sql = `
      SELECT
        id,
        name,
        email,
        phone,
        address,
        city,
        city_part,
        region,
        zipcode,
        created_at::text AS created_at,
        updated_at::text AS updated_at
      FROM customers
      WHERE id = $1
      LIMIT 1
    `;

    const result = await erpDb.query<ErpCustomer>(sql, [id]);
    return result.rows?.[0] ?? null;
  } catch (error: any) {
    if (error?.statusCode) throw error;
    throw new InternalServerError(`Failed to fetch ERP customer: ${error?.message || "Unknown error"}`);
  }
}

