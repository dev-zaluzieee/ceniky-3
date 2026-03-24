/**
 * Calculation backend (Supabase) session: cookie helpers, refresh, and proxied fetch with 401 retry.
 * Server-only — uses next/headers cookies().
 */

import { cookies } from "next/headers";

/** Base URL for the žaluzieee calculation / auth API. */
export function getCalculationBackendUrl(): string {
  return (
    process.env.CALCULATION_BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_CALCULATION_BACKEND_API_URL ||
    "http://localhost:3002"
  );
}

/** `data` object from POST /api/auth/signin or POST /api/auth/refresh (Supabase session). */
export interface CalculationAuthSessionPayload {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  user?: {
    id?: string;
    email?: string;
    role?: string | null;
    raynet_id?: string | null;
    raynet_name?: string | null;
    raw_user_meta_data?: { raynet_name?: string };
  };
}

export type CalculationCookieStore = Awaited<ReturnType<typeof cookies>>;

/** Clears all auth cookies (sign-out / invalid refresh). */
export function clearCalculationSessionCookies(cookieStore: CalculationCookieStore): void {
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
  cookieStore.delete("expires_at");
  cookieStore.delete("user_email");
  cookieStore.delete("user_id");
  cookieStore.delete("user_raynet_id");
  cookieStore.delete("user_raynet_name");
}

/**
 * Writes session cookies after sign-in or refresh.
 * Always persist `refresh_token` from the response when present (Supabase may rotate it).
 */
export function applyCalculationSessionCookies(
  cookieStore: CalculationCookieStore,
  data: CalculationAuthSessionPayload,
  isProduction: boolean
): void {
  cookieStore.set("access_token", data.access_token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge:
      data.expires_at != null ? Math.max(0, Math.floor(data.expires_at - Date.now() / 1000)) : 3600,
  });

  if (data.refresh_token) {
    cookieStore.set("refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  if (data.expires_at != null) {
    cookieStore.set("expires_at", String(data.expires_at), {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  if (data.user) {
    const u = data.user;
    if (u.email) {
      cookieStore.set("user_email", u.email, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    if (u.id) {
      cookieStore.set("user_id", u.id, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    const raynetId = u.raynet_id;
    if (raynetId == null) {
      cookieStore.delete("user_raynet_id");
    } else {
      cookieStore.set("user_raynet_id", String(raynetId), {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    const raynetName =
      u.raynet_name ?? u.raw_user_meta_data?.raynet_name ?? null;
    if (raynetName == null || typeof raynetName !== "string" || raynetName.trim() === "") {
      cookieStore.delete("user_raynet_name");
    } else {
      cookieStore.set("user_raynet_name", raynetName.trim(), {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
  }
}

/** Valid access JWT from the mutable cookie store (reflects sets in the same request). */
export function getValidCalculationAccessTokenFromCookieStore(
  cookieStore: CalculationCookieStore
): string | null {
  const accessToken = cookieStore.get("access_token")?.value;
  if (!accessToken) return null;
  const expiresAt = cookieStore.get("expires_at")?.value;
  if (expiresAt) {
    const expirationTime = parseInt(expiresAt, 10) * 1000;
    const now = Date.now();
    if (Number.isNaN(expirationTime) || now >= expirationTime) {
      return null;
    }
  }
  return accessToken;
}

export interface RefreshSessionResult {
  ok: boolean;
  newAccessToken?: string;
  user?: CalculationAuthSessionPayload["user"];
  expires_at?: number | null;
}

/**
 * Calls calculation backend POST /api/auth/refresh and updates cookies on success.
 * On 401 from the backend, clears session cookies.
 */
export async function performCalculationSessionRefresh(
  cookieStore: CalculationCookieStore,
  refreshToken: string
): Promise<RefreshSessionResult> {
  const backendUrl = getCalculationBackendUrl();
  const refreshUrl = `${backendUrl}/api/auth/refresh`;
  const isProduction = process.env.NODE_ENV === "production";

  let response: Response;
  try {
    response = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
  } catch (e) {
    console.error("Calculation session refresh: network error", e);
    return { ok: false };
  }

  let json: { success?: boolean; data?: CalculationAuthSessionPayload; message?: string };
  try {
    json = await response.json();
  } catch {
    return { ok: false };
  }

  if (!response.ok || !json.success || !json.data?.access_token) {
    if (response.status === 401) {
      clearCalculationSessionCookies(cookieStore);
    }
    return { ok: false };
  }

  applyCalculationSessionCookies(cookieStore, json.data, isProduction);

  return {
    ok: true,
    newAccessToken: json.data.access_token,
    user: json.data.user,
    expires_at: json.data.expires_at ?? null,
  };
}

/**
 * Proxies to the calculation backend with Bearer auth.
 * Refreshes when access is missing/expired, and retries once after upstream 401.
 */
export async function fetchCalculationBackendWithRefresh(
  url: string,
  init?: Omit<RequestInit, "headers"> & { headers?: HeadersInit }
): Promise<Response> {
  const cookieStore = await cookies();

  async function getBearer(): Promise<string | null> {
    let t = getValidCalculationAccessTokenFromCookieStore(cookieStore);
    if (t) return t;
    const rt = cookieStore.get("refresh_token")?.value;
    if (!rt) return null;
    const r = await performCalculationSessionRefresh(cookieStore, rt);
    return r.newAccessToken ?? null;
  }

  const token = await getBearer();
  if (!token) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Unauthorized - failed to get calculation backend token",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const baseHeaders = new Headers(init?.headers);
  if (!baseHeaders.has("Content-Type")) {
    baseHeaders.set("Content-Type", "application/json");
  }
  baseHeaders.set("Authorization", `Bearer ${token}`);

  let response = await fetch(url, {
    ...init,
    headers: baseHeaders,
    cache: "no-store",
  });

  if (response.status === 401) {
    const rt = cookieStore.get("refresh_token")?.value;
    if (rt) {
      const r2 = await performCalculationSessionRefresh(cookieStore, rt);
      if (r2.ok && r2.newAccessToken) {
        baseHeaders.set("Authorization", `Bearer ${r2.newAccessToken}`);
        response = await fetch(url, {
          ...init,
          headers: baseHeaders,
          cache: "no-store",
        });
      }
    }
  }

  return response;
}
