"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useAppMode } from "@/lib/mode-context";

/**
 * Header component with logo, title, mode toggle, and user info / sign out
 * Styled with brand primary (green) background and white text
 * Logo uses native img to avoid Next.js Image optimizer "received null" with WebP in dev
 */
export default function Header() {
  const { isAuthenticated, user, signOut, isLoading } = useAuth();
  const { mode, setMode } = useAppMode();

  return (
    <header className="sticky top-0 z-40 border-b border-primary-hover/30 bg-primary shadow-sm dark:border-primary/50">
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
            <Link
              href="/changelog"
              className="rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-primary"
            >
              Co je nového
            </Link>
          </div>

          {/* Mode toggle + User info and sign out */}
          {!isLoading && isAuthenticated && user && (
            <div className="flex items-center gap-3 sm:gap-4">
              {/* TEST / PRODUCTION toggle */}
              <div className="inline-flex overflow-hidden rounded-lg border border-white/30">
                <button
                  type="button"
                  onClick={() => setMode("TEST")}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "TEST"
                      ? "bg-amber-500 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  TEST
                </button>
                <button
                  type="button"
                  onClick={() => setMode("PRODUCTION")}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "PRODUCTION"
                      ? "bg-red-600 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  PRODUKCE
                </button>
              </div>

              <span className="text-sm text-white/90">
                {user.email}
              </span>
              <button
                type="button"
                onClick={signOut}
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
