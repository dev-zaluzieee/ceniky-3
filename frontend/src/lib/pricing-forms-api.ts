/**
 * Client API for OVT-available pricing forms (product_pricing).
 * Used on order detail to list/search forms and get one by id for custom form creation.
 */

/** List item from GET /api/forms/pricing */
export interface PricingFormListItem {
  id: string;
  manufacturer: string;
  product_code: string;
}

/** Detail from GET /api/forms/pricing/[id] (includes ovt_export_json for form) */
export interface PricingFormDetail {
  id: string;
  manufacturer: string;
  product_code: string;
  ovt_export_json: unknown;
}

export interface ListPricingFormsResponse {
  success: boolean;
  data?: PricingFormListItem[];
  error?: string;
}

export interface GetPricingFormResponse {
  success: boolean;
  data?: PricingFormDetail;
  error?: string;
}

export interface ListManufacturersResponse {
  success: boolean;
  data?: string[];
  error?: string;
}

/**
 * List OVT-available forms with optional manufacturer and product_code search.
 */
export async function listPricingForms(params?: {
  manufacturer?: string;
  search?: string;
}): Promise<ListPricingFormsResponse> {
  try {
    const sp = new URLSearchParams();
    if (params?.manufacturer?.trim()) sp.set("manufacturer", params.manufacturer.trim());
    if (params?.search?.trim()) sp.set("search", params.search.trim());
    const qs = sp.toString();
    const url = `/api/forms/pricing${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json" } });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? "Failed to list forms" };
    return { success: true, data: data.data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Network error" };
  }
}

/**
 * Get one OVT form by id (includes ovt_export_json for generating custom form).
 */
export async function getPricingFormById(id: string): Promise<GetPricingFormResponse> {
  try {
    const res = await fetch(`/api/forms/pricing/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? "Failed to get form" };
    return { success: true, data: data.data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Network error" };
  }
}

/**
 * List distinct manufacturers that have OVT-available forms.
 */
export async function listPricingManufacturers(): Promise<ListManufacturersResponse> {
  try {
    const res = await fetch("/api/forms/pricing/manufacturers", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error ?? "Failed to list manufacturers" };
    return { success: true, data: data.data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Network error" };
  }
}
