/**
 * Parser for window/door screens form data
 */

import { SiteFormData } from "@/types/forms/site.types";
import { ParsedFormInfo } from "./parsed-form.types";

/**
 * Parse window/door screens form data and extract basic information
 * @param formJson - Raw form JSON data
 * @returns Parsed form information
 */
export function parseSiteForm(formJson: Record<string, any>): ParsedFormInfo {
  // Type guard to ensure we have the correct structure
  const data = formJson as Partial<SiteFormData>;

  return {
    phone: data.phone || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    // Site form doesn't have a name field
  };
}
