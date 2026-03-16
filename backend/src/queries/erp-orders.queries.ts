/**
 * ERP orders queries (data access layer).
 * Uses a read-only replica of the ERP database.
 */

import { erpDb } from "../services/erp-db.client";
import { ErpOrder } from "../types/erp.types";
import { InternalServerError } from "../utils/errors";

/**
 * Fetch ERP orders for a given customer ID.
 * Excludes soft-deleted orders. Ordered by created_at DESC.
 *
 * @param customerId - ERP customer id
 * @returns list of ERP orders (may be empty)
 */
export async function getErpOrdersByCustomerId(customerId: number): Promise<ErpOrder[]> {
  try {
    await erpDb.initialize();

    const sql = `
      SELECT
        id,
        status,
        created_at::text AS created_at,
        updated_at::text AS updated_at,
        customer_id,
        priority,
        order_type,
        parent_order_id
      FROM orders
      WHERE customer_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC NULLS LAST
      LIMIT 50
    `;

    const result = await erpDb.query<ErpOrder>(sql, [customerId]);
    return result.rows ?? [];
  } catch (error: any) {
    if (error?.statusCode) throw error;
    throw new InternalServerError(`Failed to fetch ERP orders: ${error?.message || "Unknown error"}`);
  }
}
