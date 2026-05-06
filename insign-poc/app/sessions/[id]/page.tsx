import Link from "next/link";
import { getSessionById, listSignedDocuments } from "@/lib/db";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import SessionDetail from "./SessionDetail";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const session = await getSessionById(params.id);
  if (!session) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-white p-8 text-center text-sm">
        Sezení nenalezeno. <Link className="text-[var(--accent)]" href="/">Zpět</Link>
      </div>
    );
  }
  const documents = await listSignedDocuments(session.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-sm text-[var(--muted)] hover:underline">← Sezení</Link>
          <h1 className="mt-1 text-2xl font-semibold">{session.displayname}</h1>
          <p className="text-sm text-[var(--muted)]">
            Vytvořeno {formatDate(session.created_at)} · inSign session{" "}
            <code className="font-mono text-xs">{session.insign_session_id}</code>
          </p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(session.status)}`}>
          {statusLabel(session.status)}
        </span>
      </div>

      <SessionDetail
        session={JSON.parse(JSON.stringify(session))}
        initialDocuments={JSON.parse(JSON.stringify(documents))}
      />
    </div>
  );
}
