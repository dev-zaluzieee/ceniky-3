/**
 * Server-side authentication utilities for Supabase Auth via calculation backend
 * Provides functions to get auth tokens and session info on the server
 */

import { cookies } from "next/headers";

/**
 * Get access token from cookies (server-side)
 * @returns Access token string or null if not authenticated
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (!accessToken) {
      return null;
    }

    // Check expiration (invalid or non-numeric expires_at is treated as expired)
    const expiresAt = cookieStore.get("expires_at")?.value;
    if (expiresAt) {
      const expirationTime = parseInt(expiresAt, 10) * 1000; // Convert to milliseconds
      const now = Date.now();
      if (Number.isNaN(expirationTime) || now >= expirationTime) {
        // Token expired
        return null;
      }
    }

    return accessToken;
  } catch (error) {
    console.error("Error getting access token:", error);
    return null;
  }
}

/**
 * Get user session info from cookies (server-side)
 * @returns User session info or null if not authenticated
 */
export async function getServerSession(): Promise<{
  user: {
    email: string | null;
    id: string | null;
  };
  expires_at: number | null;
} | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;

    if (!accessToken) {
      return null;
    }

    // Check expiration (invalid or non-numeric expires_at is treated as expired)
    const expiresAt = cookieStore.get("expires_at")?.value;
    if (expiresAt) {
      const expirationTime = parseInt(expiresAt, 10) * 1000; // Convert to milliseconds
      const now = Date.now();
      if (Number.isNaN(expirationTime) || now >= expirationTime) {
        // Token expired
        return null;
      }
    }

    const userEmail = cookieStore.get("user_email")?.value || null;
    const userId = cookieStore.get("user_id")?.value || null;
    const parsedExpiresAt = expiresAt ? parseInt(expiresAt, 10) : null;

    return {
      user: {
        email: userEmail,
        id: userId,
      },
      expires_at: parsedExpiresAt != null && !Number.isNaN(parsedExpiresAt) ? parsedExpiresAt : null,
    };
  } catch (error) {
    console.error("Error getting server session:", error);
    return null;
  }
}

/**
 * Check if user is authenticated (server-side)
 * @returns Promise<boolean>
 */
export async function isAuthenticatedServer(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}
