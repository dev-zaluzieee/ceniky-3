/**
 * Raynet API client
 * Handles HTTP communication with Raynet external API
 */

import { RaynetApiResponse } from "../types/raynet.types";
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
  const authorization = process.env.RAYNET_AUTHORIZATION;
  const instanceName = process.env.RAYNET_INSTANCE_NAME;

  if (!authorization) {
    throw new BadRequestError("RAYNET_AUTHORIZATION environment variable is not set");
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
