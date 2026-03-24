/**
 * Next.js API route for calculation backend manufacturers
 * Handles GET requests to fetch manufacturers from calculation backend
 * Acts as a proxy between frontend and calculation backend
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchCalculationBackendWithRefresh,
  getCalculationBackendUrl,
} from "@/lib/calculation-session";

/**
 * GET /api/calculation/manufacturers
 * Fetch manufacturers from calculation backend
 * Supports optional search query parameter
 */
export async function GET(request: NextRequest) {
  try {
    // Get search query parameter if provided
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    // Build backend URL
    const backendUrl = getCalculationBackendUrl();
    const url = new URL(`${backendUrl}/api/ovt/manufacturers`);
    if (search) {
      url.searchParams.set("search", search);
    }

    let response;
    try {
      response = await fetchCalculationBackendWithRefresh(url.toString(), {
        method: "GET",
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
    console.error("Error in GET /api/calculation/manufacturers:", error);
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
