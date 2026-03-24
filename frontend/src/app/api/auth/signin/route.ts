/**
 * POST /api/auth/signin
 * Sign in with email and password using calculation backend Supabase Auth
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { applyCalculationSessionCookies, getCalculationBackendUrl } from "@/lib/calculation-session";

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

    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    applyCalculationSessionCookies(cookieStore, data.data, isProduction);

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
