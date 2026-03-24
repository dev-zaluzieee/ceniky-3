"use client";

import { useState, useEffect } from "react";
import {
  getSession,
  signOut as authSignOut,
  refreshSession,
  SessionResponse,
} from "@/lib/auth";
import { useRouter } from "next/navigation";

/** Proactively refresh when access JWT expires within this window (seconds). */
const REFRESH_SOON_SECONDS = 120;

/**
 * Custom hook for authentication state
 * Provides session data and sign out functionality
 */
export function useAuth() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Fetch session on mount; refresh access token shortly before expiry
    const loadSession = async () => {
      try {
        let sessionData = await getSession();

        if (
          sessionData.success &&
          sessionData.authenticated &&
          sessionData.expires_at != null
        ) {
          const expMs = sessionData.expires_at * 1000;
          if (expMs - Date.now() <= REFRESH_SOON_SECONDS * 1000) {
            const refreshed = await refreshSession();
            if (refreshed.success) {
              sessionData = await getSession();
            }
          }
        }

        setSession(sessionData);
      } catch (error) {
        console.error("Error fetching session:", error);
        setSession({ success: false, authenticated: false });
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();

    // Refresh session periodically (every 5 minutes)
    const interval = setInterval(loadSession, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const signOut = async () => {
    try {
      await authSignOut();
      setSession({ success: false, authenticated: false });
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return {
    session,
    isLoading,
    isAuthenticated: session?.authenticated === true,
    user: session?.user,
    signOut,
  };
}
