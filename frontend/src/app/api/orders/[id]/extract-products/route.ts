/**
 * Next.js API route: GET /api/orders/[id]/extract-products
 * Proxies to backend: extract products from step 1 forms for ADMF prefill (with mocked prices)
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import jwt from "jsonwebtoken";

function getBackendUrl(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "http://localhost:3001"
  );
}

async function getAuthToken(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) return null;
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (!secret) return null;
    const email = token.email || token.id;
    if (!email) return null;
    return jwt.sign(
      { email, id: token.id || email },
      secret,
      { expiresIn: "1h" }
    );
  } catch {
    return null;
  }
}

/** GET /api/orders/[id]/extract-products - Extract products from step 1 forms (mocked prices) */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = await getAuthToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const { id } = await params;
    const response = await fetch(`${getBackendUrl()}/api/orders/${id}/extract-products`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in GET /api/orders/[id]/extract-products:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
