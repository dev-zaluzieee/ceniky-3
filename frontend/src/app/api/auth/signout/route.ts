/**
 * POST /api/auth/signout
 * Sign out user by clearing authentication cookies
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/auth/signout
 * Clear all authentication cookies
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";

    // Clear all auth cookies
    cookieStore.delete("access_token");
    cookieStore.delete("refresh_token");
    cookieStore.delete("expires_at");
    cookieStore.delete("user_email");
    cookieStore.delete("user_id");

    return NextResponse.json({ success: true, message: "Signed out successfully" });
  } catch (error: any) {
    console.error("Error in POST /api/auth/signout:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}
