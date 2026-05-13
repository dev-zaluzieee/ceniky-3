import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS: RegExp[] = [
  /^\/login$/,
  /^\/offline$/,
  /^\/maintenance$/,
  /^\/api\/auth(\/.*)?$/,
  /^\/api(\/.*)?$/,
  /^\/_next(\/.*)?$/,
  /^\/favicon\.ico$/,
  /^\/sw\.js(\.map)?$/,
  /^\/swe-worker-.*\.js(\.map)?$/,
  /^\/icons\//,
  /^\/.*\.(?:png|jpe?g|gif|webp|svg|ico|json|txt|xml|webmanifest)$/i,
  // Form preview iframe — receives a validated_payload via postMessage from
  // the validation-products admin app and renders DynamicProductForm against
  // it. Read-only, no DB writes, no user-specific data; origin check happens
  // inside the page itself. Public on purpose so the admin doesn't need to
  // log in as an OVT user just to preview their schema edits.
  /^\/forms\/preview$/,
];

/**
 * Maintenance gate — when the `MAINTENANCE_MODE` env var is `"true"`,
 * every request gets redirected to /maintenance (pages) or returns a JSON
 * 503 (API routes). Static assets pass through so the page can render.
 *
 * Toggling requires a redeploy on Vercel (env vars are inlined at build).
 */
const MAINTENANCE_BYPASS: RegExp[] = [
  /^\/maintenance$/,
  /^\/_next(\/.*)?$/,
  /^\/favicon\.ico$/,
  /^\/icons\//,
  /^\/.*\.(?:png|jpe?g|gif|webp|svg|ico|json|txt|xml|webmanifest)$/i,
];

function isMaintenanceBypass(pathname: string): boolean {
  return MAINTENANCE_BYPASS.some((re) => re.test(pathname));
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(url);
}

/**
 * Attempts BFF session refresh using httpOnly refresh_token (same pattern as full navigation with expired access).
 */
async function tryMiddlewareSessionRefresh(req: NextRequest): Promise<NextResponse | null> {
  const refreshToken = req.cookies.get("refresh_token")?.value;
  if (!refreshToken) return null;

  try {
    const refreshUrl = new URL("/api/auth/refresh", req.nextUrl.origin);
    const refreshRes = await fetch(refreshUrl.toString(), {
      method: "POST",
      headers: { Cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
    });

    if (!refreshRes.ok) return null;

    const next = NextResponse.next();
    const withSetCookie = refreshRes.headers as Headers & { getSetCookie?: () => string[] };
    const list = typeof withSetCookie.getSetCookie === "function" ? withSetCookie.getSetCookie() : [];
    if (list.length > 0) {
      for (const c of list) {
        next.headers.append("Set-Cookie", c);
      }
    } else {
      const single = refreshRes.headers.get("set-cookie");
      if (single) next.headers.append("Set-Cookie", single);
    }
    return next;
  } catch {
    return null;
  }
}

/**
 * Middleware to check Supabase Auth session
 * Checks for access_token cookie and validates expiration; refreshes via BFF when refresh_token is valid
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Maintenance gate — runs before everything else so even unauthenticated
  // OVT reps see the maintenance page (not the login screen).
  if (process.env.MAINTENANCE_MODE === "true" && !isMaintenanceBypass(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Service is in maintenance mode" },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } }
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    const res = NextResponse.rewrite(url);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Allow public paths
  if (isPublic(pathname)) return NextResponse.next();

  const accessToken = req.cookies.get("access_token")?.value;

  if (!accessToken) {
    const refreshed = await tryMiddlewareSessionRefresh(req);
    if (refreshed) return refreshed;
    return redirectToLogin(req);
  }

  const expiresAt = req.cookies.get("expires_at")?.value;
  if (expiresAt) {
    const expirationTime = parseInt(expiresAt, 10) * 1000;
    const now = Date.now();
    if (Number.isNaN(expirationTime) || now >= expirationTime) {
      const refreshed = await tryMiddlewareSessionRefresh(req);
      if (refreshed) return refreshed;
      return redirectToLogin(req);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
