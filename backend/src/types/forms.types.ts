/**
 * Type definitions for forms API
 */

/**
 * Supported form types
 */
export type FormType =
  | "horizontalni-zaluzie"
  | "plise-zaluzie"
  | "site"
  | "textile-rolety"
  | "universal";

/**
 * Form data structure stored in database
 */
export interface FormRecord {
  id: number;
  user_id: string;
  form_type: FormType;
  form_json: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Request body for creating a form
 */
export interface CreateFormRequest {
  form_type: FormType;
  form_json: Record<string, any>;
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
