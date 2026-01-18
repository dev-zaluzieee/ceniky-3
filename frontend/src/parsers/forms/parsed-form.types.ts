/**
 * Common types for parsed form data
 */

/**
 * Basic information extracted from any form
 */
export interface ParsedFormInfo {
  phone?: string;
  address?: string;
  city?: string;
  name?: string; // If available in the form
}
