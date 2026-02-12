/**
 * Client-side fetch for pricing export from calculation backend
 */

import type { PricingExportResponse } from "./pricing-export.types";

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Fetch pricing export for a category (dimension limits, surcharges, etc.)
 * @param categoryId - Category UUID
 */
export async function fetchPricingExport(
  categoryId: string
): Promise<ApiEnvelope<PricingExportResponse["data"]>> {
  try {
    const url = `/api/calculation/categories/${encodeURIComponent(categoryId)}/pricing-export`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = (await res.json()) as PricingExportResponse & { data?: PricingExportResponse["data"] };
    if (!res.ok) {
      return {
        success: false,
        error: data.error || data.message || "Failed to fetch pricing export",
      };
    }
    return { success: true, data: data.data };
  } catch (e: any) {
    return { success: false, error: "Network error", message: e?.message };
  }
}
