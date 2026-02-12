/**
 * Next.js API route for calculation backend pricing export
 * GET /api/calculation/categories/[id]/pricing-export
 * Proxies to calculation backend GET /api/admin/categories/:id/pricing-export
 */

import { NextRequest, NextResponse } from "next/server";

function getCalculationBackendUrl(): string {
  return (
    process.env.CALCULATION_BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_CALCULATION_BACKEND_API_URL ||
    "http://localhost:3002"
  );
}

async function getCalculationBackendToken(request: NextRequest): Promise<string | null> {
  try {
    const accessToken = request.cookies.get("access_token")?.value;
    if (!accessToken) return null;
    const expiresAt = request.cookies.get("expires_at")?.value;
    if (expiresAt) {
      const expirationTime = parseInt(expiresAt, 10) * 1000;
      const now = Date.now();
      if (Number.isNaN(expirationTime) || now >= expirationTime) return null;
    }
    return accessToken;
  } catch {
    return null;
  }
}

/**
 * GET /api/calculation/categories/[id]/pricing-export
 * Returns full pricing definition for the category (dimension limits, surcharges, etc.)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = await getCalculationBackendToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - failed to get calculation backend token" },
        { status: 401 }
      );
    }

    const { id: categoryId } = await params;
    if (!categoryId) {
      return NextResponse.json(
        { success: false, error: "Category ID is required" },
        { status: 400 }
      );
    }

    const backendUrl = getCalculationBackendUrl();
    const url = `${backendUrl}/api/admin/categories/${encodeURIComponent(categoryId)}/pricing-export`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in GET /api/calculation/categories/[id]/pricing-export:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
