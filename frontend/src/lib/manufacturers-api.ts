/**
 * Client-side utilities for fetching manufacturers from calculation backend
 */

/**
 * Manufacturer interface matching API response
 */
export interface Manufacturer {
  id: string;
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
 * Fetch manufacturers from calculation backend
 * @param search - Optional search query to filter manufacturers by name
 * @returns Promise with manufacturers list or error
 */
export async function fetchManufacturers(
  search?: string
): Promise<ApiEnvelope<Manufacturer[]>> {
  try {
    // Build URL with optional search parameter
    const url = new URL("/api/calculation/manufacturers", window.location.origin);
    if (search) {
      url.searchParams.set("search", search);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = (await res.json()) as ApiEnvelope<Manufacturer[]>;
    if (!res.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch manufacturers",
        message: data.message,
      };
    }
    return data;
  } catch (e: any) {
    return { success: false, error: "Network error", message: e?.message };
  }
}
