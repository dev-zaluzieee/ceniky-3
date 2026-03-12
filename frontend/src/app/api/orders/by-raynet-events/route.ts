/**
 * Next.js API route to resolve orders by Raynet event IDs.
 * Proxies request to backend orders endpoint.
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
 * POST /api/orders/by-raynet-events
 * Body: { eventIds: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const response = await fetch(`${getBackendUrl()}/api/orders/by-raynet-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/orders/by-raynet-events:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
