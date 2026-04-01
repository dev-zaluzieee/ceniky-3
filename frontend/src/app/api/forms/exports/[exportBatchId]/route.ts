/**
 * Next.js API route proxy for export batch logs (any status).
 * Forwards authenticated GET to backend GET /api/forms/exports/:exportBatchId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * GET /api/forms/exports/[exportBatchId]
 * Returns latest logs for Raynet + ERP for a batch ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exportBatchId: string }> }
) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { exportBatchId } = await params;

    const backendResponse = await fetch(`${getBackendUrl()}/api/forms/exports/${exportBatchId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error: unknown) {
    console.error("Error in GET /api/forms/exports/[exportBatchId]:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

