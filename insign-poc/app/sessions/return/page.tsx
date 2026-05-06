import Link from "next/link";

export default function ReturnPage() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white p-8 text-center">
      <h1 className="text-xl font-semibold">Děkujeme</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Sezení v inSign bylo dokončeno. Stav se za chvíli synchronizuje skrze webhook.
      </p>
      <Link href="/" className="mt-4 inline-block text-sm text-[var(--accent)] hover:underline">
        Zpět na seznam sezení
      </Link>
    </div>
  );
}
