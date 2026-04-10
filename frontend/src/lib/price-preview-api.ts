import type { ProductPayload } from "@/types/json-schema-form.types";

export interface RowPricePreview {
  product_name: string;
  dimensions_label: string;
  quantity: number;
  unit_price_grid: number;
  line_base: number;
  surcharge_total: number;
  final_price: number;
  pricing_variant_id: string;
  surcharge_only?: boolean;
  surcharges?: Array<{ code: string; label?: string; amount: number }>;
  surcharge_warnings?: string[];
}

export interface RowPricePreviewResponse {
  success: boolean;
  data?: RowPricePreview;
  error?: string;
}

/**
 * Resolve a lightweight price preview for one custom-form row.
 * Uses the same backend pricing logic as ADMF extraction, but returns only row-level pricing info.
 */
export async function getRowPricePreview(params: {
  product_pricing_id: string;
  row_values: Record<string, string | number | boolean>;
  row_schema: ProductPayload;
}): Promise<RowPricePreviewResponse> {
  try {
    const res = await fetch("/api/forms/price-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? "Failed to load price preview" };
    return { success: true, data: data.data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Network error" };
  }
}
