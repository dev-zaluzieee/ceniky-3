/**
 * Next.js API route proxy for ADMF export image generation.
 * Forwards authenticated request to backend and streams PNG binary response.
 * Path keeps the legacy /pdf name; the response is image/png.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * GET /api/forms/[id]/pdf
 * Returns image/png for authenticated user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const backendResponse = await fetch(`${getBackendUrl()}/api/forms/${id}/pdf`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!backendResponse.ok) {
      const contentType = backendResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });
      }
      return NextResponse.json(
        { success: false, error: "Failed to generate image" },
        { status: backendResponse.status }
      );
    }

    const arrayBuffer = await backendResponse.arrayBuffer();
    const filename = backendResponse.headers.get("content-disposition") ?? `inline; filename="admf-${id}.png"`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": filename,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/forms/[id]/pdf:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
