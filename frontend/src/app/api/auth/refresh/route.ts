/**
 * POST /api/auth/refresh
 * Exchanges httpOnly refresh_token cookie for a new Supabase session via calculation backend.
 * Response shape matches sign-in (no tokens in JSON — cookies are updated).
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { performCalculationSessionRefresh } from "@/lib/calculation-session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { success: false, message: "No refresh token" },
        { status: 401 }
      );
    }

    const result = await performCalculationSessionRefresh(cookieStore, refreshToken);

    if (!result.ok) {
      return NextResponse.json(
        { success: false, message: "Session refresh failed" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: result.user,
        expires_at: result.expires_at,
      },
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/auth/refresh:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
