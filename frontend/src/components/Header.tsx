"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

/**
 * Header component with logo, title and user info / sign out
 * Styled with brand primary (green) background and white text
 * Logo uses native img to avoid Next.js Image optimizer "received null" with WebP in dev
 */
export default function Header() {
  const { data: session, status } = useSession();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="border-b border-primary-hover/30 bg-primary shadow-sm dark:border-primary/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and title */}
          {/* Single branding: logo only (no duplicate text); larger so full logo is visible */}
          <div className="flex items-center gap-4">
            <Link href="/" className="flex shrink-0 items-center">
              <img
                src="/logo-zaluzieee-barevne-384x94.webp"
                alt="Žaluzieee"
                width={384}
                height={94}
                className="h-10 w-auto sm:h-11"
              />
            </Link>
            <span className="hidden border-l border-white/30 pl-4 text-sm font-medium text-white/90 sm:inline">
              Výrobní dokumentace
            </span>
          </div>

          {/* User info and sign out - on-brand styling */}
          {status === "authenticated" && session?.user && (
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="text-sm text-white/90">
                {session.user.name || session.user.email}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-white/40 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-primary"
              >
                Odhlásit se
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
