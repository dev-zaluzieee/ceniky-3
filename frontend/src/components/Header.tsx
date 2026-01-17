"use client";

import { useSession, signOut } from "next-auth/react";

/**
 * Header component with user information and sign out button
 */
export default function Header() {
  const { data: session, status } = useSession();

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="border-b border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Výrobní dokumentace
          </h1>
          
          {/* User info and sign out button */}
          {status === "authenticated" && session?.user && (
            <div className="flex items-center gap-4">
              {/* Display user email or name */}
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {session.user.name || session.user.email}
              </span>
              
              {/* Sign out button */}
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-50 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
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
