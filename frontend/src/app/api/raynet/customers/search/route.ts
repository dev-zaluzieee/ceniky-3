/**
 * Next.js API route for Raynet customer search
 * Handles POST requests to search for customers by phone number
 * Acts as a proxy between frontend and Express backend
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

/**
 * Get backend API URL from environment variables
 */
function getBackendUrl(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "http://localhost:3001"
  );
}

/**
 * POST /api/raynet/customers/search
 * Search for customers in Raynet by phone number
 */
export async function POST(request: NextRequest) {
  try {
    // Get authentication token
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    let body;
    try {
      body = await request.json();
    } catch (error: any) {
      console.error("Error parsing request body:", error);
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.phone || typeof body.phone !== "string") {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Forward request to Express backend with authentication
    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/api/raynet/customers/search`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError: any) {
      console.error("Fetch error (backend may be unreachable):", fetchError.message);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to connect to backend server",
          details:
            process.env.NODE_ENV === "development"
              ? `Backend URL: ${url}, Error: ${fetchError.message}`
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
          error: "Invalid response from backend",
          details:
            process.env.NODE_ENV === "development" ? `Status: ${response.status}` : undefined,
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      console.error("Backend error:", response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/raynet/customers/search:", error);
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
