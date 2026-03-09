/**
 * Next.js API route for Raynet events
 * Proxies authenticated requests to the Express backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "http://localhost:3001"
  );
}

/**
 * GET /api/raynet/events?date=YYYY-MM-DD
 * Returns Raynet calendar events for the authenticated user.
 */
export async function GET(request: NextRequest) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: date (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const backendUrl = getBackendUrl();
    const url = new URL("/api/raynet/events", backendUrl);
    url.searchParams.set("date", date);

    let response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
    } catch (error: any) {
      console.error("Fetch error when calling backend /api/raynet/events:", error?.message);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to connect to backend server",
          details:
            process.env.NODE_ENV === "development"
              ? `Backend URL: ${url.toString()}, Error: ${error?.message}`
              : undefined,
        },
        { status: 503 }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError: any) {
      console.error("Error parsing backend /api/raynet/events response:", parseError);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid response from backend",
          details:
            process.env.NODE_ENV === "development"
              ? `Status: ${response.status}`
              : undefined,
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      console.error("Backend /api/raynet/events error:", response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in GET /api/raynet/events:", error);
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

