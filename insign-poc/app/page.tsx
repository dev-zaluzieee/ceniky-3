import Link from "next/link";
import { listSessions } from "@/lib/db";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sessions = await listSessions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sezení</h1>
          <p className="text-sm text-[var(--muted)]">Seznam podepisovacích sezení vytvořených v inSign.</p>
        </div>
        <Link
          href="/sessions/new"
          className="inline-flex items-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Nové sezení
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--muted)]">
          Zatím nebylo vytvořeno žádné sezení.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Vytvořeno</th>
                <th className="px-4 py-3 text-left">Zákazník</th>
                <th className="px-4 py-3 text-left">Režim</th>
                <th className="px-4 py-3 text-left">Stav</th>
                <th className="px-4 py-3 text-left">inSign session ID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--muted)]">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3">{s.customer_name ?? "—"}</td>
                  <td className="px-4 py-3">{s.delivery_mode === "inapp" ? "V aplikaci" : "Email/SMS"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(s.status)}`}>
                      {statusLabel(s.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{s.insign_session_id}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/sessions/${s.id}`} className="text-[var(--accent)] hover:underline">Detail →</Link>
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
