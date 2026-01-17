import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getBackendBaseUrl } from "@/lib/backend";
import { authOptions } from "../../[...nextauth]/route";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions as any) as any;
  const email = session?.user?.email as string | undefined;
  if (!email) return NextResponse.json({ error: "Missing session" }, { status: 401 });
  const base = getBackendBaseUrl();
  const url = new URL(base || "");
  url.pathname = "/auth/ovt/is-admin";
  url.searchParams.set("email", email);
  const res = await fetch(url.toString(), { headers: { "x-admin-key": process.env.REPORTING_BACKEND_ADMIN_API_KEY || "" }, cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") || "application/json" } });
}
