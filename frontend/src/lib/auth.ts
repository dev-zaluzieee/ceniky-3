/**
 * Authentication utilities for Supabase Auth via calculation backend
 * Provides functions to interact with the auth API
 */

/**
 * Sign in response interface
 */
export interface SignInResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string;
      role?: string | null;
      /**
       * Raynet user identifier paired in Supabase metadata.
       * Null when the user is not paired.
       */
      raynet_id?: string | null;
      /** Raynet display name (for ADMF Zprostredkovatel and export). */
      raynet_name?: string | null;
    };
    expires_at: number;
  };
  message?: string;
}

/**
 * Session response interface
 */
export interface SessionResponse {
  success: boolean;
  authenticated: boolean;
  user?: {
    email: string | null;
    id: string | null;
    /**
     * Raynet user identifier paired in Supabase metadata.
     * Null when the user is not paired.
     */
    raynet_id?: string | null;
    /** Raynet display name (for ADMF Zprostredkovatel and export). */
    raynet_name?: string | null;
  };
  expires_at?: number | null;
  message?: string;
}

/**
 * Sign in with email and password
 * @param email - User email
 * @param password - User password
 * @returns Promise with sign in response
 */
export async function signIn(email: string, password: string): Promise<SignInResponse> {
  try {
    const response = await fetch("/api/auth/signin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Sign in failed",
      };
    }

    return data;
  } catch (error: any) {
    console.error("Error signing in:", error);
    return {
      success: false,
      message: "Network error. Please check your connection and try again.",
    };
  }
}

/** Single in-flight refresh so parallel callers share one POST /api/auth/refresh. */
let refreshSessionPromise: Promise<{ success: boolean; message?: string }> | null = null;

/**
 * Refresh Supabase session via BFF (httpOnly refresh_token cookie).
 * Deduplicates concurrent calls.
 */
export async function refreshSession(): Promise<{ success: boolean; message?: string }> {
  if (refreshSessionPromise) {
    return refreshSessionPromise;
  }
  refreshSessionPromise = (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          message: (data as { message?: string }).message || "Session refresh failed",
        };
      }
      return { success: true };
    } catch (error: unknown) {
      console.error("Error refreshing session:", error);
      return { success: false, message: "Network error during session refresh" };
    } finally {
      refreshSessionPromise = null;
    }
  })();
  return refreshSessionPromise;
}

/**
 * Sign out current user
 * @returns Promise with sign out response
 */
export async function signOut(): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch("/api/auth/signout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || "Sign out failed",
      };
    }

    return data;
  } catch (error: any) {
    console.error("Error signing out:", error);
    return {
      success: false,
      message: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Get current session
 * @returns Promise with session response
 */
export async function getSession(): Promise<SessionResponse> {
  try {
    const response = await fetch("/api/auth/session", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        authenticated: false,
        message: data.message,
      };
    }

    return data;
  } catch (error: any) {
    console.error("Error getting session:", error);
    return {
      success: false,
      authenticated: false,
      message: "Network error. Please check your connection and try again.",
    };
  }
}

/**
 * Check if user is authenticated
 * @returns Promise<boolean>
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session.authenticated === true;
}
