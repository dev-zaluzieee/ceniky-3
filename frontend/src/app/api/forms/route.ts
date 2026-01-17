/**
 * Next.js API route for forms
 * Handles GET (list) and POST (create) operations
 * Acts as a proxy between frontend and Express backend
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import jwt from "jsonwebtoken";

/**
 * Get backend API URL from environment variables
 */
function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * Generate bearer token from NextAuth session
 * Uses the same secret as NextAuth to sign JWT
 */
function generateBearerToken(email: string): string {
  const secret = process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured");
  }

  // Create JWT token with user email
  return jwt.sign({ email }, secret, { expiresIn: "1h" });
}

/**
 * GET /api/forms
 * List forms for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Get session from NextAuth
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Generate bearer token
    const bearerToken = generateBearerToken(session.user.email);

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${getBackendUrl()}/api/forms${queryString ? `?${queryString}` : ""}`;

    // Forward request to Express backend
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in GET /api/forms:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forms
 * Create a new form
 */
export async function POST(request: NextRequest) {
  try {
    // Get session from NextAuth
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();

    // Validate required fields
    if (!body.form_type || !body.form_json) {
      return NextResponse.json(
        { success: false, error: "form_type and form_json are required" },
        { status: 400 }
      );
    }

    // Generate bearer token
    const bearerToken = generateBearerToken(session.user.email);

    // Forward request to Express backend
    const response = await fetch(`${getBackendUrl()}/api/forms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/forms:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
