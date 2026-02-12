/**
 * Next.js API route for calculation backend categories
 * Handles GET requests to fetch categories from calculation backend
 * Acts as a proxy between frontend and calculation backend
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Get calculation backend API URL from environment variables
 */
function getCalculationBackendUrl(): string {
  return (
    process.env.CALCULATION_BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_CALCULATION_BACKEND_API_URL ||
    "http://localhost:3002"
  );
}

/**
 * Get Supabase authentication token from cookies
 * Returns the access_token from the httpOnly cookie set during signin
 */
async function getCalculationBackendToken(request: NextRequest): Promise<string | null> {
  try {
    // Get access token from cookies
    const accessToken = request.cookies.get("access_token")?.value;

    if (!accessToken) {
      console.error("No access token found in cookies");
      return null;
    }

    // Check token expiration (invalid or non-numeric expires_at is treated as expired)
    const expiresAt = request.cookies.get("expires_at")?.value;
    if (expiresAt) {
      const expirationTime = parseInt(expiresAt, 10) * 1000; // Convert to milliseconds
      const now = Date.now();
      if (Number.isNaN(expirationTime) || now >= expirationTime) {
        console.error("Access token has expired or invalid expires_at");
        return null;
      }
    }

    return accessToken;
  } catch (error) {
    console.error("Error getting calculation backend token:", error);
    return null;
  }
}

/**
 * GET /api/calculation/categories
 * Fetch categories from calculation backend
 * Supports optional manufacturerId and search query parameters
 */
export async function GET(request: NextRequest) {
  try {
    // Get Supabase authentication token from calculation backend
    const authToken = await getCalculationBackendToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - failed to get calculation backend token" },
        { status: 401 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const manufacturerId = searchParams.get("manufacturerId");
    const search = searchParams.get("search");

    // Build backend URL
    const backendUrl = getCalculationBackendUrl();
    const url = new URL(`${backendUrl}/api/ovt/categories`);
    if (manufacturerId) {
      url.searchParams.set("manufacturerId", manufacturerId);
    }
    if (search) {
      url.searchParams.set("search", search);
    }

    let response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        cache: "no-store",
      });
    } catch (fetchError: any) {
      console.error("Fetch error (calculation backend may be unreachable):", fetchError.message);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to connect to calculation backend server",
          details:
            process.env.NODE_ENV === "development"
              ? `Backend URL: ${url.toString()}, Error: ${fetchError.message}`
              : undefined,
        },
        { status: 503 }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError: any) {
      console.error("Error parsing backend response:", parseError);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid response from calculation backend",
          details:
            process.env.NODE_ENV === "development" ? `Status: ${response.status}` : undefined,
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      console.error("Calculation backend error:", response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in GET /api/calculation/categories:", error);
    console.error("Error details:", error.message, error.stack);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
