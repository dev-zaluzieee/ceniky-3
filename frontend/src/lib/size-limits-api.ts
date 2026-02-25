/**
 * Client API for size limits (manufacturing / warranty ranges) from pricing DB.
 * Used in custom form to validate "Výrobní šířka" / "Výrobní výška" per row.
 */

export interface SizeLimitsResult {
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

export interface CheckSizeLimitsResponse {
  success: boolean;
  data?: SizeLimitsResult;
  error?: string;
}

/**
 * Check size limits for a form row. Backend finds matching size_limit_variant and returns
 * ranges + whether width/height are inside manufacturing and warranty.
 */
export async function checkSizeLimits(params: {
  product_pricing_id: string;
  width: number;
  height: number;
  row_values: Record<string, string>;
}): Promise<CheckSizeLimitsResponse> {
  try {
    const res = await fetch("/api/forms/size-limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? "Failed to check size limits" };
    return { success: true, data: data.data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Network error" };
  }
}
