/**
 * Parser router for form types (custom, admf).
 */

import { FormType } from "@/lib/forms-api";
import { ParsedFormInfo } from "./parsed-form.types";

/**
 * Parse form data based on form type for display (name, address, etc.).
 */
export function parseForm(
  formType: FormType,
  formJson: Record<string, any>
): ParsedFormInfo {
  try {
    switch (formType) {
      case "admf":
        return { name: formJson?.name ?? "ADMF" };

      case "custom": {
        const data = formJson?.data;
        return { name: data?.productName ?? "Vlastní formulář" };
      }

      default:
        console.warn(`Unknown form type: ${formType}`);
        return {};
    }
  } catch (error) {
    console.error(`Error parsing form type ${formType}:`, error);
    return {};
  }
}
