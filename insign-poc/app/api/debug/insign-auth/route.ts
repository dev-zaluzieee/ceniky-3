import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getAccessToken } from "@/lib/insign-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = (() => { try { return env.insign.baseUrl(); } catch { return null; } })();
  const username = (() => { try { return env.insign.username(); } catch { return null; } })();
  const passwordLen = (() => { try { return env.insign.password().length; } catch { return null; } })();
  const overrideBearer = (() => { try { return env.insign.bearerToken().length > 0; } catch { return false; } })();

  if (!baseUrl) return NextResponse.json({ error: "INSIGN_BASE_URL not set" }, { status: 500 });

  const result: Record<string, unknown> = {
    baseUrl,
    username,
    passwordLength: passwordLen,
    foruser: process.env.INSIGN_FORUSER ?? null,
    overrideBearerSet: overrideBearer,
  };

  result.versionUnauth = await probe(`${baseUrl}/version`);

  let token: string | null = null;
  try {
    token = await getAccessToken();
    result.tokenAcquired = { ok: true, length: token.length };
  } catch (e) {
    result.tokenAcquired = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (token) {
    result.versionAuth = await probe(`${baseUrl}/version`, { Authorization: `Bearer ${token}` });
    result.configureSessionProbe = await probe(
      `${baseUrl}/configure/session`,
      { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      { method: "POST", body: JSON.stringify({ displayname: "debug-probe", foruser: env.insign.foruser(), documents: [] }) }
    );
  }

  return NextResponse.json(result);
}

async function probe(url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<unknown> {
  try {
    const res = await fetch(url, { method: init.method ?? "GET", headers, body: init.body, cache: "no-store" });
    const text = await res.text();
    return { url, status: res.status, ok: res.ok, contentType: res.headers.get("content-type"), bodyPreview: text.slice(0, 400) };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e) };
  }
}
