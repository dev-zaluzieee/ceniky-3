/**
 * Client-side utilities for ERP order lookups.
 */

import type { ErpOrder } from "@/types/erp.types";

export interface ErpOrdersResponse {
  success: boolean;
  data?: { orders: ErpOrder[]; totalCount: number };
  error?: string;
  message?: string;
}

/**
 * Fetch ERP orders for a given ERP customer ID.
 */
export async function fetchErpOrdersByCustomerId(
  customerId: number
): Promise<ErpOrdersResponse> {
  try {
    const res = await fetch(`/api/erp/customers/${customerId}/orders`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = (await res.json()) as ErpOrdersResponse;
    if (!res.ok)
      return {
        success: false,
        error: data.error || "Failed to fetch ERP orders",
        message: data.message,
      };
    return data;
  } catch (e: any) {
    return { success: false, error: "Network error", message: e?.message };
  }
}
