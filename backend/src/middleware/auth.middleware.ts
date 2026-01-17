/**
 * Authentication middleware for Express routes
 * Validates bearer token and extracts user information
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../utils/errors";

/**
 * Extended Express Request with user information
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * JWT payload structure
 */
interface JwtPayload {
  email: string;
  id?: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication middleware
 * Validates bearer token from Authorization header
 * Extracts user email and attaches to request
 */
export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError("Authorization header is required");
    }

    // Check if it's a bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new UnauthorizedError("Invalid authorization header format. Expected: Bearer <token>");
    }

    const token = parts[1];

    if (!token) {
      throw new UnauthorizedError("Token is required");
    }

    // Get JWT secret from environment
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

    if (!secret) {
      console.error("JWT secret is not configured");
      throw new UnauthorizedError("Server configuration error");
    }

    // Verify and decode token
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, secret) as JwtPayload;
    } catch (error: any) {
      if (error.name === "TokenExpiredError") {
        throw new UnauthorizedError("Token has expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new UnauthorizedError("Invalid token");
      }
      throw new UnauthorizedError("Token verification failed");
    }

    // Extract user email from token
    const userEmail = decoded.email || decoded.id;

    if (!userEmail || typeof userEmail !== "string") {
      throw new UnauthorizedError("Token does not contain valid user information");
    }

    // Attach user information to request
    req.userId = userEmail;
    req.userEmail = userEmail;

    next();
  } catch (error: any) {
    // If it's already an ApiError, pass it through
    if (error.statusCode) {
      return next(error);
    }

    // Otherwise, wrap it as UnauthorizedError
    next(new UnauthorizedError(error.message || "Authentication failed"));
  }
}
