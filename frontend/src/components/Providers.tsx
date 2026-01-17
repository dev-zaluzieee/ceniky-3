"use client";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

/**
 * Client-side provider wrapper for NextAuth SessionProvider
 * Required because SessionProvider is a client component and layout.tsx is a server component
 */
export default function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
