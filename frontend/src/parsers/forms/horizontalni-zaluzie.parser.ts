/**
 * Parser for horizontal blinds form data
 */

import { HorizontalniZaluzieFormData } from "@/types/forms/horizontalni-zaluzie.types";
import { ParsedFormInfo } from "./parsed-form.types";

/**
 * Parse horizontal blinds form data and extract basic information
 * @param formJson - Raw form JSON data
 * @returns Parsed form information
 */
export function parseHorizontalniZaluzieForm(
  formJson: Record<string, any>
): ParsedFormInfo {
  // Type guard to ensure we have the correct structure
  const data = formJson as Partial<HorizontalniZaluzieFormData>;

  return {
    phone: data.phone || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    // Horizontal blinds form doesn't have a name field
  };
}
