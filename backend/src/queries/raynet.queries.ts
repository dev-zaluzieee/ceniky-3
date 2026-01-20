/**
 * Raynet API queries (data access layer)
 * Handles all external API calls to Raynet
 */

import { RaynetApiResponse, RaynetLead } from "../types/raynet.types";
import { InternalServerError } from "../utils/errors";
import * as raynetClient from "../services/raynet.client";

/**
 * Search for customers in Raynet by phone number
 * @param phoneNumber - Phone number to search for
 * @returns Array of matching Raynet lead records
 * @throws InternalServerError if API call fails
 */
export async function searchCustomersByPhone(phoneNumber: string): Promise<RaynetLead[]> {
  try {
    // Call Raynet API client
    const response: RaynetApiResponse = await raynetClient.searchLeadsByPhone(phoneNumber);

    // Return the leads data
    return response.data || [];
  } catch (error: any) {
    // If it's already an ApiError, re-throw it
    if (error.statusCode) {
      throw error;
    }

    // Otherwise, wrap it as InternalServerError
    throw new InternalServerError(
      `Failed to search customers in Raynet: ${error.message || "Unknown error"}`
    );
  }
}
