/**
 * Raynet API queries (data access layer)
 * Handles all external API calls to Raynet
 */

import { RaynetApiResponse, RaynetLead, RaynetEvent, RaynetEventApiResponse } from "../types/raynet.types";
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

/**
 * Fetch Raynet events for a given owner and date.
 * @param ownerId - Raynet user identifier (string)
 * @param date - ISO date string in format YYYY-MM-DD
 * @returns Array of Raynet events
 */
export async function getEventsForOwnerAndDate(
  ownerId: string,
  date: string
): Promise<RaynetEvent[]> {
  try {
    const from = `${date} 00:00`;
    const till = `${date} 23:59`;

    const response: RaynetEventApiResponse = await raynetClient.getEvents({
      personFilter: ownerId,
      scheduledFrom: from,
      scheduledTill: till,
      categoryIds: [220, 221, 222, 223],
      statusNotEquals: "CANCELLED",
      offset: 0,
      limit: 200,
    });

    return response.data || [];
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    throw new InternalServerError(
      `Failed to fetch events from Raynet: ${error.message || "Unknown error"}`
    );
  }
}
