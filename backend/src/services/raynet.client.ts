/**
 * Raynet API client
 * Handles HTTP communication with Raynet external API
 */

import { RaynetApiResponse, RaynetEventApiResponse } from "../types/raynet.types";
import { BadRequestError, InternalServerError } from "../utils/errors";

/**
 * Configuration for Raynet API
 */
interface RaynetConfig {
  baseUrl: string;
  authorization: string;
  instanceName: string;
}

/**
 * Get Raynet configuration from environment variables
 * @returns Raynet configuration
 * @throws BadRequestError if required environment variables are missing
 */
function getRaynetConfig(): RaynetConfig {
  // Support both legacy RAYNET_AUTHORIZATION and new RAYNET_BASIC_AUTH envs
  const authorization = process.env.RAYNET_AUTHORIZATION || process.env.RAYNET_BASIC_AUTH;
  const instanceName = process.env.RAYNET_INSTANCE_NAME;

  if (!authorization) {
    throw new BadRequestError("RAYNET_AUTHORIZATION or RAYNET_BASIC_AUTH environment variable is not set");
  }

  if (!instanceName) {
    throw new BadRequestError("RAYNET_INSTANCE_NAME environment variable is not set");
  }

  return {
    baseUrl: "https://app.raynet.cz:443",
    authorization,
    instanceName,
  };
}

/**
 * Search for leads (customers) in Raynet by phone number
 * @param phoneNumber - Phone number to search for
 * @returns Raynet API response with matching leads
 * @throws InternalServerError if API call fails
 */
export async function searchLeadsByPhone(phoneNumber: string): Promise<RaynetApiResponse> {
  const config = getRaynetConfig();

  // Validate phone number
  if (!phoneNumber || typeof phoneNumber !== "string" || phoneNumber.trim().length === 0) {
    throw new BadRequestError("Phone number is required");
  }

  // Clean phone number (remove spaces, dashes, etc.)
  const cleanPhoneNumber = phoneNumber.trim().replace(/[\s\-\(\)]/g, "");

  try {
    // Build URL with fulltext search parameter
    const url = new URL(`${config.baseUrl}/api/v2/lead`);
    url.searchParams.append("fulltext", cleanPhoneNumber);

    // Prepare authorization header (handle both "Basic <token>" and just "<token>" formats)
    const authHeader = config.authorization.startsWith("Basic ")
      ? config.authorization
      : `Basic ${config.authorization}`;

    // Make API request
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "X-Instance-Name": config.instanceName,
        "Content-Type": "application/json",
      },
    });

    // Check if request was successful
    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerError(
        `Raynet API request failed with status ${response.status}: ${errorText}`
      );
    }

    // Parse response
    const data = (await response.json()) as RaynetApiResponse;

    // Validate response structure
    if (typeof data.success !== "boolean" || !Array.isArray(data.data)) {
      throw new InternalServerError("Invalid response format from Raynet API");
    }

    return data;
  } catch (error: any) {
    // If it's already an ApiError, re-throw it
    if (error.statusCode) {
      throw error;
    }

    // Otherwise, wrap it as InternalServerError
    throw new InternalServerError(
      `Failed to search Raynet API: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Fetch Raynet calendar events for a given owner and date range.
 * @param params.personFilter - Raynet person identifier (personFilter)
 * @param params.scheduledFrom - Inclusive start datetime (YYYY-MM-DD HH:mm)
 * @param params.scheduledTill - Exclusive end datetime (YYYY-MM-DD HH:mm)
 * @param params.categoryIds - Allowed category ids
 * @param params.statusNotEquals - Excluded event status value
 */
export async function getEvents(params: {
  personFilter: string;
  scheduledFrom: string;
  scheduledTill: string;
  categoryIds: number[];
  statusNotEquals: string;
  offset?: number;
  limit?: number;
}): Promise<RaynetEventApiResponse> {
  const config = getRaynetConfig();

  try {
    const url = new URL(`${config.baseUrl}/api/v2/event`);

    // Pagination
    url.searchParams.append("offset", String(params.offset ?? 0));
    url.searchParams.append("limit", String(params.limit ?? 200));

    // Raynet person filter binds events to the currently paired Raynet user.
    url.searchParams.append("personFilter", params.personFilter);

    // Date window
    url.searchParams.append("scheduledFrom[GE]", params.scheduledFrom);
    url.searchParams.append("scheduledTill[LT]", params.scheduledTill);

    // Exclude cancelled events and include allowed categories.
    url.searchParams.append("status[NE]", params.statusNotEquals);
    if (params.categoryIds.length > 0) {
      url.searchParams.append("category-id[IN]", params.categoryIds.join(","));
    }

    const authHeader = config.authorization.startsWith("Basic ")
      ? config.authorization
      : `Basic ${config.authorization}`;

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "X-Instance-Name": config.instanceName,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerError(
        `Raynet events API request failed with status ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as RaynetEventApiResponse;

    if (typeof data.success !== "boolean" || !Array.isArray(data.data)) {
      throw new InternalServerError("Invalid response format from Raynet events API");
    }

    return data;
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    throw new InternalServerError(
      `Failed to fetch Raynet events: ${error.message || "Unknown error"}`
    );
  }
}

/**
 * Update the description of a Raynet event.
 * @param eventId - Raynet event ID
 * @param description - New description text
 */
export async function updateEventDescription(
  eventId: number,
  description: string
): Promise<void> {
  const config = getRaynetConfig();

  try {
    const url = `${config.baseUrl}/api/v2/event/${eventId}/`;

    const authHeader = config.authorization.startsWith("Basic ")
      ? config.authorization
      : `Basic ${config.authorization}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "X-Instance-Name": config.instanceName,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerError(
        `Raynet event update failed with status ${response.status}: ${errorText}`
      );
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    throw new InternalServerError(
      `Failed to update Raynet event description: ${error.message || "Unknown error"}`
    );
  }
}
