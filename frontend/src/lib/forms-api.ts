/**
 * Client-side utilities for form submission
 * Provides functions to interact with the forms API
 */

/**
 * Form type definitions
 */
export type FormType =
  | "horizontalni-zaluzie"
  | "plise-zaluzie"
  | "site"
  | "textile-rolety"
  | "universal";

/**
 * Form submission response
 */
export interface FormSubmissionResponse {
  success: boolean;
  data?: {
    id: number;
    user_id: string;
    form_type: FormType;
    form_json: Record<string, any>;
    created_at: string;
    updated_at: string;
  };
  error?: string;
  message?: string;
}

/**
 * Submit a form to the API
 * @param formType - Type of form being submitted
 * @param formData - Form data object
 * @returns Promise with submission response
 */
export async function submitForm(
  formType: FormType,
  formData: Record<string, any>
): Promise<FormSubmissionResponse> {
  try {
    const response = await fetch("/api/forms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        form_type: formType,
        form_json: formData,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to submit form",
        message: data.message,
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    console.error("Error submitting form:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Update an existing form
 * @param formId - ID of the form to update
 * @param formData - Updated form data object
 * @returns Promise with update response
 */
export async function updateForm(
  formId: number,
  formData: Record<string, any>
): Promise<FormSubmissionResponse> {
  try {
    const response = await fetch(`/api/forms/${formId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        form_json: formData,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to update form",
        message: data.message,
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    console.error("Error updating form:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Form record structure from API
 */
export interface FormRecord {
  id: number;
  user_id: string;
  form_type: FormType;
  form_json: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Response for listing forms
 */
export interface ListFormsResponse {
  success: boolean;
  data?: FormRecord[];
  pagination?: PaginationInfo;
  error?: string;
  message?: string;
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
 * Get list of forms for the authenticated user
 * @param query - Optional query parameters (form_type, page, limit)
 * @returns Promise with list of forms and pagination info
 */
export async function getForms(
  query: ListFormsQuery = {}
): Promise<ListFormsResponse> {
  try {
    // Build query string
    const params = new URLSearchParams();
    if (query.form_type) {
      params.append("form_type", query.form_type);
    }
    if (query.page) {
      params.append("page", query.page.toString());
    }
    if (query.limit) {
      params.append("limit", query.limit.toString());
    }

    const queryString = params.toString();
    const url = `/api/forms${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch forms",
        message: data.message,
      };
    }

    return {
      success: true,
      data: data.data,
      pagination: data.pagination,
    };
  } catch (error: any) {
    console.error("Error fetching forms:", error);
    return {
      success: false,
      error: "Network error. Please check your connection and try again.",
    };
  }
}
