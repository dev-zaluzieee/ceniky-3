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
