/**
 * Next.js API route for calculation backend pricing export
 * GET /api/calculation/categories/[id]/pricing-export
 * Proxies to calculation backend GET /api/admin/categories/:id/pricing-export
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchCalculationBackendWithRefresh,
  getCalculationBackendUrl,
} from "@/lib/calculation-session";

/**
 * GET /api/calculation/categories/[id]/pricing-export
 * Returns full pricing definition for the category (dimension limits, surcharges, etc.)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: categoryId } = await params;
    if (!categoryId) {
      return NextResponse.json(
        { success: false, error: "Category ID is required" },
        { status: 400 }
      );
    }

    const backendUrl = getCalculationBackendUrl();
    const url = `${backendUrl}/api/admin/categories/${encodeURIComponent(categoryId)}/pricing-export`;

    const response = await fetchCalculationBackendWithRefresh(url, {
      method: "GET",
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
