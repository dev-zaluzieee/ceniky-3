import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Údržba — Žaluzieee OVT",
  description: "Probíhá údržba systému",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mb-4 text-5xl" aria-hidden="true">
          🛠️
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Probíhá údržba
        </h1>
        <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-200">
          Aktuálně provádíme aktualizaci dat. Aplikace bude za chvíli opět
          dostupná.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Děkujeme za trpělivost.
        </p>
      </div>
    </div>
  );
}
