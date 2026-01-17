/**
 * Validation utilities for form data
 */

import { FormType } from "../types/forms.types";
import { BadRequestError } from "./errors";

/**
 * Valid form types
 */
const VALID_FORM_TYPES: FormType[] = [
  "horizontalni-zaluzie",
  "plise-zaluzie",
  "site",
  "textile-rolety",
  "universal",
];

/**
 * Validate form type
 * @param formType - Form type to validate
 * @throws BadRequestError if form type is invalid
 */
export function validateFormType(formType: string): asserts formType is FormType {
  if (!VALID_FORM_TYPES.includes(formType as FormType)) {
    throw new BadRequestError(
      `Invalid form type. Must be one of: ${VALID_FORM_TYPES.join(", ")}`,
      "INVALID_FORM_TYPE"
    );
  }
}

/**
 * Validate form JSON structure
 * Ensures form_json is an object and not empty
 * @param formJson - Form JSON to validate
 * @throws BadRequestError if form JSON is invalid
 */
export function validateFormJson(formJson: any): asserts formJson is Record<string, any> {
  if (!formJson || typeof formJson !== "object" || Array.isArray(formJson)) {
    throw new BadRequestError("form_json must be a valid object", "INVALID_FORM_JSON");
  }

  if (Object.keys(formJson).length === 0) {
    throw new BadRequestError("form_json cannot be empty", "EMPTY_FORM_JSON");
  }
}

/**
 * Validate user ID
 * @param userId - User ID to validate
 * @throws BadRequestError if user ID is invalid
 */
export function validateUserId(userId: string): void {
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    throw new BadRequestError("Invalid user ID", "INVALID_USER_ID");
  }
}

/**
 * Validate pagination parameters
 * @param page - Page number
 * @param limit - Items per page
 * @returns Normalized pagination parameters
 */
export function validatePagination(page?: number, limit?: number): { page: number; limit: number } {
  const normalizedPage = page && page > 0 ? page : 1;
  const normalizedLimit = limit && limit > 0 && limit <= 100 ? limit : 20;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
  };
}
