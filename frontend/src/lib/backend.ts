import { NextRequest, NextResponse } from "next/server";

export const getBackendBaseUrl = (): string => {
  // Prefer explicit server var, then public var
  return process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";
};

export const buildBackendUrl = (targetPath: string, req?: NextRequest): string => {
  const base = getBackendBaseUrl();
  const url = new URL(base || "http://localhost:3001");
  url.pathname = targetPath.startsWith("/") ? targetPath : `/${targetPath}`;
  if (req) {
    const incoming = req.nextUrl.searchParams;
    incoming.forEach((v, k) => url.searchParams.set(k, v));
  }
  return url.toString();
};

export const proxyRequest = async (req: NextRequest, targetPath: string): Promise<NextResponse> => {
  const url = buildBackendUrl(targetPath, req);
  const headers: Record<string, string> = {
    "x-admin-key": process.env.REPORTING_BACKEND_ADMIN_API_KEY || "",
  };
  const res = await fetch(url, { headers, cache: "no-store" });
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "application/json";
  return new NextResponse(text, { status: res.status, headers: { "content-type": contentType } });
};
