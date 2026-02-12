/**
 * GET /api/auth/session
 * Get current user session information
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/auth/session
 * Return current session data from cookies
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;
    const expiresAt = cookieStore.get("expires_at")?.value;
    const userEmail = cookieStore.get("user_email")?.value;
    const userId = cookieStore.get("user_id")?.value;

    // Check if token exists and is not expired
    if (!accessToken) {
      return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
    }

    // Check expiration (invalid or non-numeric expires_at is treated as expired)
    if (expiresAt) {
      const expirationTime = parseInt(expiresAt, 10) * 1000; // Convert to milliseconds
      const now = Date.now();
      if (Number.isNaN(expirationTime) || now >= expirationTime) {
        // Token expired or invalid - clear cookies
        cookieStore.delete("access_token");
        cookieStore.delete("refresh_token");
        cookieStore.delete("expires_at");
        cookieStore.delete("user_email");
        cookieStore.delete("user_id");
        return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
      }
    }

    const parsedExpiresAt = expiresAt ? parseInt(expiresAt, 10) : null;

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        email: userEmail || null,
        id: userId || null,
      },
      expires_at: parsedExpiresAt != null && !Number.isNaN(parsedExpiresAt) ? parsedExpiresAt : null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/auth/session:", error);
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
