/**
 * Parser for plisé blinds form data
 */

import { PliseZaluzieFormData } from "@/types/forms/plise-zaluzie.types";
import { ParsedFormInfo } from "./parsed-form.types";

/**
 * Parse plisé blinds form data and extract basic information
 * @param formJson - Raw form JSON data
 * @returns Parsed form information
 */
export function parsePliseZaluzieForm(
  formJson: Record<string, any>
): ParsedFormInfo {
  // Type guard to ensure we have the correct structure
  const data = formJson as Partial<PliseZaluzieFormData>;

  return {
    phone: data.phone || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    // Plisé blinds form doesn't have a name field
  };
}
