/**
 * Admin token middleware: gates `/api/admin/*` routes used by the
 * ceniky-admin-2 apps (validation-products, validation-products-pricing) for
 * the price calculator, impact diff, breakage check, and change-set surfaces.
 *
 * Auth model: a single shared bearer token in `ADMIN_PREVIEW_TOKEN`. Both
 * sides (this backend + the admin Next.js apps) read the same env var, and
 * the admin apps include it in `Authorization: Bearer <token>` on every
 * `/api/admin/*` call. There is no per-user identity here — these routes are
 * meant for trusted internal admin tooling, not end users.
 *
 * Distinct from `auth.middleware.ts` (JWT, per-user) on purpose: admin tools
 * don't need a NextAuth session.
 */

import { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

const TOKEN_ENV_KEY = "ADMIN_PREVIEW_TOKEN";

function getExpectedToken(): string {
  const token = process.env[TOKEN_ENV_KEY];
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return "";
  }
  return token.trim();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function requireAdminToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const expected = getExpectedToken();
    if (!expected) {
      console.error(
        `${TOKEN_ENV_KEY} is not configured on the server; refusing all admin requests.`
      );
      throw new ForbiddenError("Admin endpoints are not enabled on this server.");
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== "string") {
      throw new UnauthorizedError("Authorization header is required");
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new UnauthorizedError(
        "Invalid authorization header format. Expected: Bearer <token>"
      );
    }

    const presented = parts[1]?.trim() ?? "";
    if (!presented) {
      throw new UnauthorizedError("Token is required");
    }

    if (!timingSafeEqual(presented, expected)) {
      throw new UnauthorizedError("Invalid admin token");
    }

    next();
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
      return next(err);
    }
    next(new UnauthorizedError("Admin authentication failed"));
  }
}
