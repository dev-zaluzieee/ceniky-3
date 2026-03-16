/**
 * Authentication utilities for main backend (BACKEND_API_URL)
 * Creates JWT tokens compatible with main backend from Supabase Auth session
 */

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { getServerSession } from "./auth-server";

/**
 * Create a JWT token compatible with main backend authentication
 * Gets user email from Supabase session and signs with NEXTAUTH_SECRET
 * @param request - Next.js request object (for API routes)
 * @returns JWT token string or null if not authenticated
 */
export async function getMainBackendToken(request?: NextRequest): Promise<string | null> {
  try {
    // Get session from Supabase Auth cookies
    const session = await getServerSession();
    
    if (!session || !session.user?.email) {
      console.error("No session or email found");
      return null;
    }

    const email = session.user.email;
    const raynetId = session.user.raynet_id ?? null;
    const raynetName = session.user.raynet_name ?? null;
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

    if (!secret) {
      console.error("No JWT secret configured");
      return null;
    }

    // Create JWT token compatible with main backend's jwt.verify
    // Main backend expects: { email, id?, raynet_id?, raynet_name? }
    const jwtToken = jwt.sign(
      {
        email: email,
        id: email, // Use email as id (main backend pattern)
        raynet_id: raynetId,
        raynet_name: raynetName,
      },
      secret,
      { expiresIn: "1h" }
    );

    return jwtToken;
  } catch (error) {
    console.error("Error creating main backend token:", error);
    return null;
  }
}

/**
 * Create a JWT token for main backend from server-side session
 * Used in Server Components and server utilities
 * @returns JWT token string or null if not authenticated
 */
export async function createMainBackendToken(): Promise<string | null> {
  try {
    // Get session from Supabase Auth cookies
    const session = await getServerSession();
    
    if (!session || !session.user?.email) {
      return null;
    }

    const email = session.user.email;
    const raynetId = session.user.raynet_id ?? null;
    const raynetName = session.user.raynet_name ?? null;
    const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;

    if (!secret) {
      return null;
    }

    // Create JWT token compatible with main backend's jwt.verify
    const jwtToken = jwt.sign(
      {
        email: email,
        id: email,
        raynet_id: raynetId,
        raynet_name: raynetName,
      },
      secret,
      { expiresIn: "1h" }
    );

    return jwtToken;
  } catch (error) {
    console.error("Error creating main backend token:", error);
    return null;
  }
}
