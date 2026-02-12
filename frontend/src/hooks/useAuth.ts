"use client";

import { useState, useEffect } from "react";
import { getSession, signOut as authSignOut, SessionResponse } from "@/lib/auth";
import { useRouter } from "next/navigation";

/**
 * Custom hook for authentication state
 * Provides session data and sign out functionality
 */
export function useAuth() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Fetch session on mount
    const fetchSession = async () => {
      try {
        const sessionData = await getSession();
        setSession(sessionData);
      } catch (error) {
        console.error("Error fetching session:", error);
        setSession({ success: false, authenticated: false });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSession();

    // Refresh session periodically (every 5 minutes)
    const interval = setInterval(fetchSession, 5 * 60 * 1000);

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
