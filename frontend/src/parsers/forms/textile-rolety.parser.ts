/**
 * Parser for textile/D&N blinds form data
 */

import { TextileRoletyFormData } from "@/types/forms/textile-rolety.types";
import { ParsedFormInfo } from "./parsed-form.types";

/**
 * Parse textile/D&N blinds form data and extract basic information
 * @param formJson - Raw form JSON data
 * @returns Parsed form information
 */
export function parseTextileRoletyForm(
  formJson: Record<string, any>
): ParsedFormInfo {
  // Type guard to ensure we have the correct structure
  const data = formJson as Partial<TextileRoletyFormData>;

  return {
    phone: data.phone || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    // Textile rolety form doesn't have a name field
  };
}
