"use client";
import { signOut, useSession } from "next-auth/react";

/**
 * User menu component with sign out functionality
 * Displays user email and provides sign out button
 */
export default function UserMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[#0d6b57]"></div>
        <span>Načítání...</span>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm text-gray-700">
        <span className="font-medium">{session.user.email}</span>
      </div>
      <button
        onClick={handleSignOut}
        className="px-4 py-2 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
      >
        Odhlásit se
      </button>
    </div>
  );
}
