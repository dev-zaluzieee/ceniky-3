import Link from "next/link";
import { listWebhookEvents } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const events = await listWebhookEvents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Webhooky</h1>
        <p className="text-sm text-[var(--muted)]">
          Posledních 200 událostí přijatých na <code>/api/insign/webhook</code>.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--muted)]">
          Zatím žádné události.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Přijato</th>
                <th className="px-4 py-3 text-left">Metoda</th>
                <th className="px-4 py-3 text-left">Event ID</th>
                <th className="px-4 py-3 text-left">inSign session</th>
                <th className="px-4 py-3 text-left">Sezení</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--muted)]">{formatDate(e.received_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.http_method}</td>
                  <td className="px-4 py-3 text-xs">{e.event_id ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.insign_session_id ?? "—"}</td>
                  <td className="px-4 py-3">
                    {e.session_id ? (
                      <Link href={`/sessions/${e.session_id}`} className="text-xs text-[var(--accent)] hover:underline">
                        otevřít
                      </Link>
                    ) : <span className="text-xs text-[var(--muted)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
