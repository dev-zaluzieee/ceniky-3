import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { recordWebhook, getSessionByInsignId } from "@/lib/db";
import { syncByInsignSessionId } from "@/lib/sync";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expectedUser = env.webhook.username();
  const expectedPass = env.webhook.password();
  if (!expectedUser && !expectedPass) return true;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const [user, ...rest] = decoded.split(":");
  const pass = rest.join(":");
  return user === expectedUser && pass === expectedPass;
}

async function handle(req: NextRequest, method: "GET" | "POST" | "PUT"): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return new NextResponse("unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="insign-poc"' },
    });
  }

  const url = new URL(req.url);
  const queryParams: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { queryParams[k] = v; });

  let bodyJson: unknown = null;
  let rawBody: string | null = null;
  if (method !== "GET") {
    rawBody = await req.text();
    if (rawBody) {
      try { bodyJson = JSON.parse(rawBody); } catch { bodyJson = null; }
    }
  }

  const eventId =
    queryParams["eventid"] ??
    queryParams["eventId"] ??
    (bodyJson && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>)["eventid"] as string | undefined : undefined) ??
    null;

  const insignSessionId =
    queryParams["sessionid"] ??
    queryParams["sessionId"] ??
    (bodyJson && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>)["sessionid"] as string | undefined : undefined) ??
    null;

  const session = insignSessionId ? await getSessionByInsignId(insignSessionId) : null;

  await recordWebhook({
    sessionId: session?.id ?? null,
    insignSessionId,
    eventId,
    httpMethod: method,
    queryParams,
    body: bodyJson,
    rawBody,
    remoteAddr: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip"),
  });

  if (insignSessionId) {
    try {
      await syncByInsignSessionId(insignSessionId);
    } catch (e) {
      console.error("[webhook] sync failed", e);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) { return handle(req, "GET"); }
export async function POST(req: NextRequest) { return handle(req, "POST"); }
export async function PUT(req: NextRequest) { return handle(req, "PUT"); }
