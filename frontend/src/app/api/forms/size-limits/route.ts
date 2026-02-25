/**
 * Next.js API route: POST /api/forms/size-limits
 * Proxies to backend POST /api/forms/size-limits (resolve manufacturing/warranty ranges for a row).
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

export async function POST(request: NextRequest) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const url = `${getBackendUrl()}/api/forms/size-limits`;
    const response = await fetch(url, {
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
    console.error("Error in POST /api/forms/size-limits:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
