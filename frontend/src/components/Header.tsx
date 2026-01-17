"use client";

/**
 * Header component
 */
export default function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Výrobní dokumentace
          </h1>
        </div>
      </div>
    </header>
  );
}
