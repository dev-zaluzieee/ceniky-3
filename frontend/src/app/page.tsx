import Link from "next/link";

/**
 * Main page with form selection
 * Single logo lives in Header; brand palette: primary (green) + accent (pink)
 */
export default function Home() {
  return (
    <div className="min-h-screen bg-brand-mint/20 py-16 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-4xl">
        {/* Page Header */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            Ceníky
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Vyberte zakázku nebo přehled uložených formulářů. Formuláře vytvoříte v rámci zakázky.
          </p>
        </div>

        {/* Orders and Forms list cards - icons use brand primary/accent only */}
        <div className="mb-8 space-y-4">
          <Link
            href="/orders"
            className="group flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-primary hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-primary"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary">
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
              className="h-5 w-5 text-accent transition-transform group-hover:translate-x-1"
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
            className="group flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-primary hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-primary"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/15 text-accent dark:bg-accent/25 dark:text-accent">
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
              className="h-5 w-5 text-accent transition-transform group-hover:translate-x-1"
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

          {/* Debug / tooling — intentionally uses pasted JSON (no backend coupling) */}
          <Link
            href="/debug/json-form"
            className="group flex items-center justify-between rounded-lg border-2 border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-primary hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-primary"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 8l-4 4 4 4"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Náhled json formuláře
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Vložte JSON payload a vygenerujte z něj testovací formulář
                </p>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-accent transition-transform group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
      </div>
    </div>
  );
}
