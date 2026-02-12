import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS: RegExp[] = [
  /^\/login$/,
  /^\/api\/auth(\/.*)?$/,
  /^\/api(\/.*)?$/,
  /^\/_next(\/.*)?$/,
  /^\/favicon\.ico$/,
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}

/**
 * Middleware to check Supabase Auth session
 * Checks for access_token cookie and validates expiration
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (isPublic(pathname)) return NextResponse.next();

  // Check for access token cookie
  const accessToken = req.cookies.get("access_token")?.value;

  if (!accessToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(url);
  }

  // Check token expiration
  const expiresAt = req.cookies.get("expires_at")?.value;
  if (expiresAt) {
    const expirationTime = parseInt(expiresAt, 10) * 1000; // Convert to milliseconds
    const now = Date.now();
    if (now >= expirationTime) {
      // Token expired - redirect to login
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("callbackUrl", req.nextUrl.href);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
