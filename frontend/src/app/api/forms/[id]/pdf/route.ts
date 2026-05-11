/**
 * Next.js API route proxy for the ADMF OBJEDNÁVKA PDF.
 * Forwards the authenticated request to the backend and streams the binary
 * response back to the browser with `application/pdf`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

/**
 * GET /api/forms/[id]/pdf
 * Returns application/pdf for the authenticated user.
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
        { success: false, error: "Failed to generate PDF" },
        { status: backendResponse.status }
      );
    }

    const arrayBuffer = await backendResponse.arrayBuffer();
    // Trust the backend's content headers but fall back to sane defaults.
    const contentType = backendResponse.headers.get("content-type") ?? "application/pdf";
    const disposition =
      backendResponse.headers.get("content-disposition") ?? `inline; filename="objednavka-${id}.pdf"`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
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
