/**
 * Server-side utilities for fetching forms
 * Used in Server Components to fetch data directly
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import jwt from "jsonwebtoken";
import { FormRecord, FormType, ListFormsQuery, PaginationInfo } from "./forms-api";

/**
 * Get backend API URL from environment variables
 */
function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * Create authentication token for backend from server session
 * @returns JWT token string or null if not authenticated
 */
async function createAuthToken(): Promise<string | null> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return null;
    }

    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      return null;
    }

    // Create JWT token compatible with backend's jwt.verify
    const jwtToken = jwt.sign(
      {
        email: session.user.email,
        id: session.user.email,
      },
      secret,
      { expiresIn: "1h" }
    );

    return jwtToken;
  } catch (error) {
    console.error("Error creating auth token:", error);
    return null;
  }
}

/**
 * Response structure for server-side form fetching
 */
export interface ServerFormsResponse {
  success: boolean;
  data?: FormRecord[];
  pagination?: PaginationInfo;
  error?: string;
}

/**
 * Fetch forms list from backend (server-side)
 * @param query - Optional query parameters
 * @returns Forms list with pagination or error
 */
export async function fetchFormsServer(
  query: ListFormsQuery = {}
): Promise<ServerFormsResponse> {
  try {
    // Get authentication token
    const authToken = await createAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Build query string
    const params = new URLSearchParams();
    if (query.form_type) {
      params.append("form_type", query.form_type);
    }
    if (query.order_id != null) {
      params.append("order_id", query.order_id.toString());
    }
    if (query.page) {
      params.append("page", query.page.toString());
    }
    if (query.limit) {
      params.append("limit", query.limit.toString());
    }

    const queryString = params.toString();
    const url = `${getBackendUrl()}/api/forms${queryString ? `?${queryString}` : ""}`;

    // Fetch from backend
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      cache: "no-store", // Always fetch fresh data
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch forms",
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
      error: "Failed to fetch forms from server",
    };
  }
}

/**
 * Response structure for server-side single form fetching
 */
export interface ServerFormResponse {
  success: boolean;
  data?: FormRecord;
  error?: string;
}

/**
 * Fetch a single form by ID from backend (server-side)
 * @param formId - Form ID to fetch
 * @returns Form data or error
 */
export async function fetchFormByIdServer(
  formId: number
): Promise<ServerFormResponse> {
  try {
    // Get authentication token
    const authToken = await createAuthToken();
    if (!authToken) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const url = `${getBackendUrl()}/api/forms/${formId}`;

    // Fetch from backend
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      cache: "no-store", // Always fetch fresh data
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: "Form not found",
        };
      }
      return {
        success: false,
        error: data.error || "Failed to fetch form",
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    console.error("Error fetching form:", error);
    return {
      success: false,
      error: "Failed to fetch form from server",
    };
  }
}
