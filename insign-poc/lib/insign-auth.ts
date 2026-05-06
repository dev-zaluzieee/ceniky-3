/**
 * OAuth2 client_credentials token acquisition + cache.
 *
 * inSign returns access tokens with `expires_in` ~1800s. We cache the token in-process
 * and refresh ~60s before expiry. When `INSIGN_BEARER_TOKEN` is set in env, we bypass
 * the OAuth2 dance entirely and use that token directly (handy for ad-hoc debugging
 * with a token pasted from Swagger).
 */

import { env } from "./env";

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __insignTokenCache: CachedToken | undefined;
  // eslint-disable-next-line no-var
  var __insignTokenInflight: Promise<CachedToken> | undefined;
}

const REFRESH_MARGIN_MS = 60_000;

export async function getAccessToken(): Promise<string> {
  const overrideToken = env.insign.bearerToken();
  if (overrideToken) return overrideToken;

  const now = Date.now();
  const cached = globalThis.__insignTokenCache;
  if (cached && cached.expiresAtMs - now > REFRESH_MARGIN_MS) {
    return cached.accessToken;
  }

  if (globalThis.__insignTokenInflight) {
    const t = await globalThis.__insignTokenInflight;
    return t.accessToken;
  }

  globalThis.__insignTokenInflight = fetchToken().finally(() => {
    globalThis.__insignTokenInflight = undefined;
  });

  const t = await globalThis.__insignTokenInflight;
  globalThis.__insignTokenCache = t;
  return t.accessToken;
}

async function fetchToken(): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.insign.username(),
    client_secret: env.insign.password(),
  });

  const res = await fetch(`${env.insign.baseUrl()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const text = await res.text();
  let parsed: { access_token?: string; expires_in?: number; error?: string; error_description?: string } = {};
  try { parsed = JSON.parse(text); } catch { /* leave parsed empty */ }

  if (!res.ok || !parsed.access_token) {
    const detail = parsed.error_description ?? parsed.error ?? text.slice(0, 300);
    throw new Error(`inSign OAuth2 token request failed (${res.status}): ${detail}`);
  }

  const expiresInSec = typeof parsed.expires_in === "number" ? parsed.expires_in : 1800;
  return {
    accessToken: parsed.access_token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
}

/** For diagnostics / manual cache invalidation. */
export function clearTokenCache(): void {
  globalThis.__insignTokenCache = undefined;
}
