/**
 * Client-side utilities for fetching categories from calculation backend
 */

/**
 * Category interface matching API response
 */
export interface Category {
  id: string;
  manufacturer_id: string;
  code: string;
  name: string;
  created_at: string;
}

/**
 * API response envelope
 */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Fetch categories from calculation backend
 * @param manufacturerId - Optional manufacturer ID to filter categories
 * @param search - Optional search query to filter categories by code or name
 * @returns Promise with categories list or error
 */
export async function fetchCategories(
  manufacturerId?: string,
  search?: string
): Promise<ApiEnvelope<Category[]>> {
  try {
    // Build URL with optional query parameters
    const url = new URL("/api/calculation/categories", window.location.origin);
    if (manufacturerId) {
      url.searchParams.set("manufacturerId", manufacturerId);
    }
    if (search) {
      url.searchParams.set("search", search);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = (await res.json()) as ApiEnvelope<Category[]>;
    if (!res.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch categories",
        message: data.message,
      };
    }
    return data;
  } catch (e: any) {
    return { success: false, error: "Network error", message: e?.message };
  }
}
