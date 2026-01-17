"use client";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";

/**
 * Header component that conditionally renders based on the current route
 * Hides on login page to avoid showing user menu when not authenticated
 */
export default function Header() {
  const pathname = usePathname();

  // Hide header on login page
  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="border-b border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Výrobní dokumentace
          </h1>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
