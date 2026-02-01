import changelogData from "@/data/changelog.json";

/** Changelog entry: date in YYYY-MM-DD, list of change descriptions */
type ChangelogEntry = { date: string; changes: string[] };

/**
 * Formats ISO date (YYYY-MM-DD) to Czech display format (d. m. yyyy).
 */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

/**
 * Changelog page: latest release highlighted at top, full history below.
 * Data is kept in src/data/changelog.json (newest first).
 */
export default function ChangelogPage() {
  const entries = changelogData as ChangelogEntry[];
  const [latest, ...history] = entries;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-2 text-2xl font-semibold text-foreground">
        Co je nového
      </h1>
      <p className="mb-8 text-sm text-foreground/70">
        Přehled změn a nových funkcí v aplikaci.
      </p>

      {/* Latest release — highlighted so users notice something new */}
      {latest && (
        <section
          className="mb-10 rounded-xl border-2 border-primary/40 bg-brand-mint/50 p-6 dark:bg-primary/10 dark:border-primary/50"
          aria-label="Nejnovější verze"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Nejnovější
            </span>
            <time
              dateTime={latest.date}
              className="text-sm font-medium text-foreground/80"
            >
              {formatDate(latest.date)}
            </time>
          </div>
          <ul className="list-inside list-disc space-y-1.5 text-foreground">
            {latest.changes.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Full history — for users who want to study past changes */}
      <section aria-label="Historie změn">
        <h2 className="mb-4 text-lg font-medium text-foreground/90">
          Starší změny
        </h2>
        <ul className="space-y-6">
          {history.map((entry, idx) => (
            <li
              key={entry.date}
              className="rounded-lg border border-foreground/10 bg-background py-4 px-4 dark:border-foreground/20"
            >
              <time
                dateTime={entry.date}
                className="mb-2 block text-sm font-medium text-foreground/70"
              >
                {formatDate(entry.date)}
              </time>
              <ul className="list-inside list-disc space-y-1 text-foreground/90">
                {entry.changes.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
