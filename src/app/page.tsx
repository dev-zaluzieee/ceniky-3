import Link from "next/link";

/**
 * Main page with form selection
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 py-16 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-4xl">
        {/* Page Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            VÝROBNÍ DOKUMENTACE
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Vyberte formulář, který chcete vyplnit
          </p>
        </div>

        {/* Form Selection Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Universal Form Card */}
          <Link
            href="/forms/universal"
            className="group rounded-lg border-2 border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Univerzální list
              </h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Univerzální formulář pro montážní dokumentaci. Vhodný pro
              standardní žaluzie a okna.
            </p>
            <div className="mt-4 flex items-center text-sm font-medium text-blue-600 dark:text-blue-400">
              Otevřít formulář
              <svg
                className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>

          {/* Textile Blinds Form Card */}
          <Link
            href="/forms/textile-rolety"
            className="group rounded-lg border-2 border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Textilní a D/N roletky
              </h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Formulář pro textilní rolety a den/noc (D/N) rolety. Vhodný pro
              produkty JAZZ, COLLETE, OPUS, SONATA a další.
            </p>
            <div className="mt-4 flex items-center text-sm font-medium text-blue-600 dark:text-blue-400">
              Otevřít formulář
              <svg
                className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
