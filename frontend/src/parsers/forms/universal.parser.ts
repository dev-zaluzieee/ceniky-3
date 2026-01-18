/**
 * Parser for universal form data
 */

import { UniversalFormData } from "@/types/forms/universal.types";
import { ParsedFormInfo } from "./parsed-form.types";

/**
 * Parse universal form data and extract basic information
 * @param formJson - Raw form JSON data
 * @returns Parsed form information
 */
export function parseUniversalForm(
  formJson: Record<string, any>
): ParsedFormInfo {
  // Type guard to ensure we have the correct structure
  const data = formJson as Partial<UniversalFormData>;

  return {
    phone: data.phone || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    // Universal form doesn't have a name field
  };
}
