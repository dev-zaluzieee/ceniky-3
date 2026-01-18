/**
 * Next.js API route for forms
 * Handles GET (list) and POST (create) operations
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
 * GET /api/forms
 * List forms
 */
export async function GET(request: NextRequest) {
  try {
    // Get authentication token
    const authToken = await getAuthToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${getBackendUrl()}/api/forms${queryString ? `?${queryString}` : ""}`;

    // Forward request to Express backend with authentication
    const response = await fetch(url, {
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
    // Get authentication token
    const authToken = await getAuthToken(request);
    if (!authToken) {
      console.error("Failed to get auth token");
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get request body
    let body;
    try {
      body = await request.json();
    } catch (error: any) {
      console.error("Error parsing request body:", error);
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.form_type || !body.form_json) {
      return NextResponse.json(
        { success: false, error: "form_type and form_json are required" },
        { status: 400 }
      );
    }

    // Forward request to Express backend with authentication
    const backendUrl = getBackendUrl();
    const url = `${backendUrl}/api/forms`;
    
    console.log("Forwarding POST request to:", url);
    
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (fetchError: any) {
      console.error("Fetch error (backend may be unreachable):", fetchError.message);
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to connect to backend server",
          details: process.env.NODE_ENV === "development" ? `Backend URL: ${url}, Error: ${fetchError.message}` : undefined
        },
        { status: 503 }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError: any) {
      console.error("Error parsing backend response:", parseError);
      return NextResponse.json(
        { 
          success: false, 
          error: "Invalid response from backend",
          details: process.env.NODE_ENV === "development" ? `Status: ${response.status}` : undefined
        },
        { status: 502 }
      );
    }

    if (!response.ok) {
      console.error("Backend error:", response.status, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/forms:", error);
    console.error("Error details:", error.message, error.stack);
    return NextResponse.json(
      { 
        success: false, 
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
