import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS: RegExp[] = [
  /^\/login$/,
  /^\/offline$/,
  /^\/api\/auth(\/.*)?$/,
  /^\/api(\/.*)?$/,
  /^\/_next(\/.*)?$/,
  /^\/favicon\.ico$/,
  /^\/sw\.js(\.map)?$/,
  /^\/swe-worker-.*\.js(\.map)?$/,
  /^\/icons\//,
  /^\/.*\.(?:png|jpe?g|gif|webp|svg|ico|json|txt|xml|webmanifest)$/i,
];

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
