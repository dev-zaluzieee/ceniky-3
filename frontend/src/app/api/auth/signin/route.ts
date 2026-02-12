/**
 * POST /api/auth/signin
 * Sign in with email and password using calculation backend Supabase Auth
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Get calculation backend API URL from environment variables
 */
function getCalculationBackendUrl(): string {
  return (
    process.env.CALCULATION_BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_CALCULATION_BACKEND_API_URL ||
    "http://localhost:3002"
  );
}

/**
 * POST /api/auth/signin
 * Authenticate user with email and password
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (error: any) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required" },
        { status: 400 }
      );
    }

    // Call calculation backend signin endpoint
    const backendUrl = getCalculationBackendUrl();
    const signinUrl = `${backendUrl}/api/auth/signin`;

    let response;
    try {
      response = await fetch(signinUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      });
    } catch (fetchError: any) {
      console.error("Error calling calculation backend signin:", fetchError.message);
      return NextResponse.json(
        {
          success: false,
          message: "Failed to connect to authentication server",
          details:
            process.env.NODE_ENV === "development"
              ? `Backend URL: ${signinUrl}, Error: ${fetchError.message}`
              : undefined,
        },
        { status: 503 }
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError: any) {
      console.error("Error parsing signin response:", parseError);
      return NextResponse.json(
        {
          success: false,
          message: "Invalid response from authentication server",
          details:
            process.env.NODE_ENV === "development" ? `Status: ${response.status}` : undefined,
        },
        { status: 502 }
      );
    }

    if (!response.ok || !data.success) {
      return NextResponse.json(
        {
          success: false,
          message: data.message || "Invalid email or password",
        },
        { status: response.status === 401 ? 401 : 500 }
      );
    }

    // Store tokens in httpOnly cookies
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";

    // Set access token cookie
    cookieStore.set("access_token", data.data.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: data.data.expires_at
        ? Math.floor(data.data.expires_at - Date.now() / 1000)
        : 3600, // Default to 1 hour if expires_at not provided
    });

    // Set refresh token cookie
    if (data.data.refresh_token) {
      cookieStore.set("refresh_token", data.data.refresh_token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    // Set expires_at cookie
    if (data.data.expires_at) {
      cookieStore.set("expires_at", data.data.expires_at.toString(), {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

    // Set user info cookies (non-sensitive)
    if (data.data.user) {
      cookieStore.set("user_email", data.data.user.email, {
        httpOnly: false, // Can be accessed client-side for display
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      if (data.data.user.id) {
        cookieStore.set("user_id", data.data.user.id, {
          httpOnly: false, // Can be accessed client-side
          secure: isProduction,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
      }
    }

    // Return success response (without sensitive tokens)
    return NextResponse.json({
      success: true,
      data: {
        user: data.data.user,
        expires_at: data.data.expires_at,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/auth/signin:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
