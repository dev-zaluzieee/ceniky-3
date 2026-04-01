/**
 * Next.js API route proxy for latest export logs (any status).
 * Forwards authenticated GET to backend GET /api/forms/:id/export-latest.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * GET /api/forms/[id]/export-latest
 * Returns latest export logs (Raynet + ERP) for polling progress.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const backendResponse = await fetch(`${getBackendUrl()}/api/forms/${id}/export-latest`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error: unknown) {
    console.error("Error in GET /api/forms/[id]/export-latest:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

