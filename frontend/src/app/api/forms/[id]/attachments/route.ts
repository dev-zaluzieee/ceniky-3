/**
 * Proxy: list (GET), upload (POST multipart), delete (DELETE) form attachments.
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
    const backendResponse = await fetch(`${getBackendUrl()}/api/forms/${id}/attachments`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (e) {
    console.error("GET /api/forms/[id]/attachments:", e);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authToken = await getMainBackendToken(request);
    if (!authToken) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const formData = await request.formData();
    const backendResponse = await fetch(`${getBackendUrl()}/api/forms/${id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });
    const data = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (e) {
    console.error("POST /api/forms/[id]/attachments:", e);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
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
      return NextResponse.json(
        { success: false, error: "Missing key", code: "MISSING_KEY" },
        { status: 400 }
      );
    }
    const backendResponse = await fetch(
      `${getBackendUrl()}/api/forms/${id}/attachments?key=${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    const data = await backendResponse.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (e) {
    console.error("DELETE /api/forms/[id]/attachments:", e);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
