/**
 * Next.js API route – proxy reverse geocoding to Express backend.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMainBackendToken } from "@/lib/auth-backend";

function getBackendUrl(): string {
  return (
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "http://localhost:3001"
  );
}

export async function GET(request: NextRequest) {
  const authToken = await getMainBackendToken(request);
  if (!authToken) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  const url = `${getBackendUrl()}/api/geocode/reverse?lat=${encodeURIComponent(lat ?? "")}&lon=${encodeURIComponent(lon ?? "")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  const text = await res.text();
  const contentType = res.headers.get("content-type") || "application/json";
  return new NextResponse(text, { status: res.status, headers: { "content-type": contentType } });
}
