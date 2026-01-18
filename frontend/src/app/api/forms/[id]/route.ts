/**
 * Next.js API route for individual form operations
 * Handles GET (single), PUT (update), and DELETE operations
 * Acts as a proxy between frontend and Express backend
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import jwt from "jsonwebtoken";

/**
 * Get backend API URL from environment variables
 */
function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * Get authentication token for backend
 * Creates a JWT token from the session to forward to Express backend
 */
async function getAuthToken(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      console.error("No token found in session");
      return null;
    }

    // Create a JWT token that the backend can verify
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      console.error("No JWT secret configured");
      return null;
    }

    // Get email from token - check both email and id fields
    const email = token.email || token.id;
    if (!email) {
      console.error("Token missing email/id:", token);
      return null;
    }

    // Create JWT token compatible with backend's jwt.verify
    const jwtToken = jwt.sign(
      {
        email: email,
        id: token.id || email,
      },
      secret,
      { expiresIn: "1h" }
    );

    return jwtToken;
  } catch (error) {
    console.error("Error getting auth token:", error);
    return null;
  }
}

/**
 * GET /api/forms/[id]
 * Get a single form by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication token
    const authToken = await getAuthToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Forward request to Express backend with authentication
    const response = await fetch(`${getBackendUrl()}/api/forms/${id}`, {
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
    console.error("Error in GET /api/forms/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/forms/[id]
 * Update a form
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication token
    const authToken = await getAuthToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Get request body
    const body = await request.json();

    // Validate required fields
    if (!body.form_json) {
      return NextResponse.json(
        { success: false, error: "form_json is required" },
        { status: 400 }
      );
    }

    // Forward request to Express backend with authentication
    const response = await fetch(`${getBackendUrl()}/api/forms/${id}`, {
      method: "PUT",
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
    console.error("Error in PUT /api/forms/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/forms/[id]
 * Delete a form (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authentication token
    const authToken = await getAuthToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Forward request to Express backend with authentication
    const response = await fetch(`${getBackendUrl()}/api/forms/${id}`, {
      method: "DELETE",
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
    console.error("Error in DELETE /api/forms/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
