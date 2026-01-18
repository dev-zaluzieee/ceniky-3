/**
 * Main parser router for all form types
 * Determines form type and routes to appropriate parser
 */

import { FormType } from "@/lib/forms-api";
import { ParsedFormInfo } from "./parsed-form.types";
import { parseHorizontalniZaluzieForm } from "./horizontalni-zaluzie.parser";
import { parsePliseZaluzieForm } from "./plise-zaluzie.parser";
import { parseSiteForm } from "./site.parser";
import { parseTextileRoletyForm } from "./textile-rolety.parser";
import { parseUniversalForm } from "./universal.parser";

/**
 * Parse form data based on form type
 * Routes to the appropriate parser for each form type
 * @param formType - Type of form to parse
 * @param formJson - Raw form JSON data
 * @returns Parsed form information
 */
export function parseForm(
  formType: FormType,
  formJson: Record<string, any>
): ParsedFormInfo {
  try {
    switch (formType) {
      case "horizontalni-zaluzie":
        return parseHorizontalniZaluzieForm(formJson);

      case "plise-zaluzie":
        return parsePliseZaluzieForm(formJson);

      case "site":
        return parseSiteForm(formJson);

      case "textile-rolety":
        return parseTextileRoletyForm(formJson);

      case "universal":
        return parseUniversalForm(formJson);

      default:
        // Unknown form type - return empty info
        console.warn(`Unknown form type: ${formType}`);
        return {};
    }
  } catch (error) {
    // If parsing fails, log error and return empty info
    console.error(`Error parsing form type ${formType}:`, error);
    return {};
  }
}
