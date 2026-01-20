/**
 * Service layer for Raynet business logic
 * Handles validation and coordinates between routes and queries
 */

import { CustomerSearchResponse, SearchCustomerByPhoneRequest } from "../types/raynet.types";
import * as raynetQueries from "../queries/raynet.queries";
import { BadRequestError } from "../utils/errors";

/**
 * Validate phone number format
 * @param phone - Phone number to validate
 * @throws BadRequestError if phone number is invalid
 */
function validatePhoneNumber(phone: string): void {
  if (!phone || typeof phone !== "string") {
    throw new BadRequestError("Phone number is required");
  }

  const trimmedPhone = phone.trim();

  if (trimmedPhone.length === 0) {
    throw new BadRequestError("Phone number cannot be empty");
  }

  // Basic validation: should contain at least digits
  // Allow common phone number formats (with spaces, dashes, parentheses)
  const phoneRegex = /^[\d\s\-\(\)\+]+$/;
  if (!phoneRegex.test(trimmedPhone)) {
    throw new BadRequestError("Phone number contains invalid characters");
  }

  // Check if there are at least 6 digits (minimum reasonable phone number length)
  const digitCount = trimmedPhone.replace(/\D/g, "").length;
  if (digitCount < 6) {
    throw new BadRequestError("Phone number is too short");
  }

  if (digitCount > 15) {
    throw new BadRequestError("Phone number is too long");
  }
}

/**
 * Search for customers in Raynet by phone number
 * @param request - Search request with phone number
 * @returns Customer search response with matching leads
 */
export async function searchCustomersByPhone(
  request: SearchCustomerByPhoneRequest
): Promise<CustomerSearchResponse> {
  // Validate phone number
  validatePhoneNumber(request.phone);

  // Search in Raynet
  const customers = await raynetQueries.searchCustomersByPhone(request.phone);

  return {
    customers,
    totalCount: customers.length,
  };
}
