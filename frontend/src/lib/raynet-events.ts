/**
 * Client-side utilities for fetching Raynet calendar events.
 */

export interface RaynetEvent {
  id: number;
  title: string;
  status: string;
  priority: string;
  scheduledFrom: string;
  scheduledTill: string;
  category: {
    id: number;
    value: string;
  } | null;
  company: {
    id: number;
    name: string;
  } | null;
  description: string | null;
  tags: string[];
  meetingPlace: string | null;
  companyAddress?: {
    city: string | null;
    country: string | null;
    province: string | null;
    street: string | null;
    zipCode: string | null;
  } | null;
}

export interface RaynetEventsResponse {
  success: boolean;
  data?: {
    events: RaynetEvent[];
    totalCount: number;
  };
  error?: string;
  message?: string;
}

/**
 * Fetch Raynet events for the given date (YYYY-MM-DD).
 */
export async function fetchRaynetEvents(
  date: string
): Promise<RaynetEventsResponse> {
  try {
    if (!date || typeof date !== "string") {
      return {
        success: false,
        error: "Missing or invalid date parameter",
      };
    }

    const response = await fetch(`/api/raynet/events?date=${encodeURIComponent(date)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch Raynet events",
        message: data.message,
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    console.error("Error fetching Raynet events:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

