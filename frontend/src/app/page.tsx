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

        {/* Orders and Forms list cards */}
        <div className="mb-8 space-y-4">
          <Link
            href="/orders"
            className="group flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
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
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Zakázky
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Založit nebo vybrat zakázku (zákazníka), poté přidávat formuláře
                </p>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-blue-600 transition-transform group-hover:translate-x-1 dark:text-blue-400"
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
          </Link>

          <Link
            href="/forms/list"
            className="group flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Vytvořené formuláře
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Zobrazit všechny vaše uložené formuláře
                </p>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-blue-600 transition-transform group-hover:translate-x-1 dark:text-blue-400"
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
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

          {/* Plisé Blinds Form Card */}
          <Link
            href="/forms/plise-zaluzie"
            className="group rounded-lg border-2 border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
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
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Plisé žaluzie
              </h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Formulář pro plisé žaluzie. Vhodný pro produkty OPAVA a KASKO s
              různými typy plisé (STD, COMBI, PM1, PM3, PM5, PS3).
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

          {/* Window/Door Screens Form Card */}
          <Link
            href="/forms/site"
            className="group rounded-lg border-2 border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
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
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Okenní sítě / Dveřní sítě
              </h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Formulář pro okenní a dveřní sítě. Vhodný pro produkty ISSO OE,
              OE, OV, DE, PS, PSR a plisé sítě STELLAR, LUX, MINI.
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

          {/* Horizontal Blinds Form Card */}
          <Link
            href="/forms/horizontalni-zaluzie"
            className="group rounded-lg border-2 border-zinc-200 bg-white p-8 shadow-sm transition-all hover:border-blue-500 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-500"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Horizontální žaluzie
              </h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Formulář pro horizontální žaluzie. Vhodný pro produkty PRIM,
              ISOLINE, LOCO, ATYP, ECO, ISOTRA 25 a interiérové typy.
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
