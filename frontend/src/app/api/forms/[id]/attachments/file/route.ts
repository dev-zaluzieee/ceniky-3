/**
 * Proxy: stream attachment file from backend (authenticated).
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3001";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const key = request.nextUrl.searchParams.get("key");
    if (!key) {
      return NextResponse.json({ success: false, error: "Missing key" }, { status: 400 });
    }
    const url = `${getBackendUrl()}/api/forms/${id}/attachments/file?key=${encodeURIComponent(key)}`;
    const backendResponse = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!backendResponse.ok) {
      const ct = backendResponse.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const data = await backendResponse.json();
        return NextResponse.json(data, { status: backendResponse.status });
      }
      return NextResponse.json({ success: false, error: "Soubor nenalezen" }, { status: backendResponse.status });
    }
    const buf = await backendResponse.arrayBuffer();
    const contentType = backendResponse.headers.get("content-type") || "application/octet-stream";
    const cd = backendResponse.headers.get("content-disposition") || "inline";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": cd,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/forms/[id]/attachments/file:", e);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
