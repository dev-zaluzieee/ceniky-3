/**
 * Type definitions for forms API
 */

/**
 * Supported form types.
 * Step 1: product forms (horizontalni-zaluzie, plise-zaluzie, site, textile-rolety, universal).
 * Step 2: ADMF (administrativní formulář) – generated from step 1 forms.
 */
export type FormType =
  | "horizontalni-zaluzie"
  | "plise-zaluzie"
  | "site"
  | "textile-rolety"
  | "universal"
  | "admf"
  | "custom";

/** Step 1 form types (used for product extraction into ADMF) */
export const STEP1_FORM_TYPES: FormType[] = [
  "horizontalni-zaluzie",
  "plise-zaluzie",
  "site",
  "textile-rolety",
  "universal",
];

/**
 * Form data structure stored in database
 */
export interface FormRecord {
  id: number;
  user_id: string;
  form_type: FormType;
  form_json: Record<string, any>;
  order_id: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Request body for creating a form.
 * Every form must belong to an order (customer).
 */
export interface CreateFormRequest {
  form_type: FormType;
  form_json: Record<string, any>;
  /** Required: order (zakázka) this form belongs to */
  order_id: number;
}

/**
 * Request body for updating a form
 */
export interface UpdateFormRequest {
  form_json: Record<string, any>;
}

/**
 * Query parameters for listing forms
 */
export interface ListFormsQuery {
  form_type?: FormType;
  /** Filter forms by order ID */
  order_id?: number;
  page?: number;
  limit?: number;
}

/**
 * Paginated response structure
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Standard API response structure
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
