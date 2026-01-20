/**
 * Client-side utilities for Raynet API integration
 * Provides functions to search for customers in Raynet
 */

import { RaynetLead } from "@/types/raynet.types";

/**
 * Response structure for customer search
 */
export interface CustomerSearchResponse {
  success: boolean;
  data?: {
    customers: RaynetLead[];
    totalCount: number;
  };
  error?: string;
  message?: string;
}

/**
 * Search for customers in Raynet by phone number
 * @param phone - Phone number to search for
 * @returns Promise with search response containing matching customers
 */
export async function searchCustomersByPhone(
  phone: string
): Promise<CustomerSearchResponse> {
  try {
    // Validate phone number
    if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
      return {
        success: false,
        error: "Phone number is required",
      };
    }

    const response = await fetch("/api/raynet/customers/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: phone.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to search customers",
        message: data.message,
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    console.error("Error searching customers:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}
