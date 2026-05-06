"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

interface SessionLike {
  id: string;
  insign_session_id: string;
  delivery_mode: "inapp" | "extern";
  access_url: string | null;
  extern_links_json: unknown;
  status: string;
  process_step: string | null;
  completed: boolean;
  rejected: boolean;
  gdpr_declined: boolean;
  customer_name: string | null;
  customer_email: string | null;
  mediator_name: string | null;
  mediator_email: string | null;
  last_status_json: unknown;
}

interface DocumentLike {
  id: string;
  kind: string;
  filename: string;
  content_type: string;
  bytes: number;
  downloaded_at: string;
}

interface ExternLink {
  externUser?: string;
  externAccessLink?: string;
  password?: string;
  orderNumber?: number;
  userType?: string;
}

export default function SessionDetail({
  session: initial,
  initialDocuments,
}: {
  session: SessionLike;
  initialDocuments: DocumentLike[];
}) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [documents, setDocuments] = useState(initialDocuments);
  const [statusJson, setStatusJson] = useState<unknown>(null);
  const [polling, setPolling] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!polling) return;
    if (session.completed || session.rejected) {
      setPolling(false);
      return;
    }
    const t = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, session.completed, session.rejected]);

  async function refresh() {
    try {
      const res = await fetch(`/api/sessions/${session.id}/status`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setStatusJson(json);
      const reload = await fetch(`/api/sessions/${session.id}`);
      const reloadJson = await reload.json();
      setSession(reloadJson.session);
      setDocuments(reloadJson.documents);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "neznámá chyba");
    }
  }

  async function reject(gdpr: boolean) {
    if (!confirm(gdpr ? "Opravdu zamítnout (GDPR)?" : "Opravdu zamítnout?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/reject?gdpr=${gdpr ? 1 : 0}`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "neznámá chyba");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDocuments() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/document?refresh=1`, { method: "GET", redirect: "manual" });
      if (!res.ok && res.status !== 0) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "neznámá chyba");
    } finally {
      setBusy(false);
    }
  }

  const externLinks: ExternLink[] = Array.isArray((session.extern_links_json as { externUsers?: ExternLink[] })?.externUsers)
    ? ((session.extern_links_json as { externUsers: ExternLink[] }).externUsers)
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        {session.delivery_mode === "inapp" && session.access_url && !session.completed && !session.rejected && (
          <InAppSigningPanel accessUrl={session.access_url} />
        )}

        {session.delivery_mode === "extern" && externLinks.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-white p-4">
            <h2 className="text-sm font-medium mb-3">Externí podepisující</h2>
            <ul className="divide-y divide-[var(--border)]">
              {externLinks.map((u, i) => (
                <li key={i} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{u.externUser ?? "(bez emailu)"}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {u.userType ?? "signatory"}{u.orderNumber ? ` · pořadí ${u.orderNumber}` : ""}
                    </div>
                  </div>
                  {u.externAccessLink ? (
                    <a href={u.externAccessLink} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] hover:underline truncate max-w-md">
                      {u.externAccessLink}
                    </a>
                  ) : <span className="text-xs text-[var(--muted)]">žádný odkaz</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Dokumenty</h2>
          {documents.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Zatím žádné stažené artefakty (po dokončení podpisu se uloží automaticky).</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{d.filename}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">{d.kind} · {formatBytes(d.bytes)}</span>
                  </div>
                  <a href={`/api/sessions/${session.id}/document?artifact=${d.id}`} className="text-xs text-[var(--accent)] hover:underline">
                    Stáhnout
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2 text-xs">
            <button onClick={refreshDocuments} disabled={busy} className="rounded-md border border-[var(--border)] px-3 py-1 hover:bg-gray-50 disabled:opacity-60">
              Stáhnout aktuální balíček z inSign
            </button>
            <a href={`/api/sessions/${session.id}/audit`} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--border)] px-3 py-1 hover:bg-gray-50">
              Audit JSON
            </a>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Stav</h2>
          <dl className="space-y-1 text-sm">
            <Row k="Stav" v={session.status} />
            <Row k="Krok procesu" v={session.process_step ?? "—"} />
            <Row k="Dokončeno" v={session.completed ? "Ano" : "Ne"} />
            <Row k="Zamítnuto" v={session.rejected ? "Ano" : "Ne"} />
            <Row k="GDPR odmítnuto" v={session.gdpr_declined ? "Ano" : "Ne"} />
            <Row k="Režim" v={session.delivery_mode === "inapp" ? "V aplikaci" : "Email/SMS"} />
            <Row k="Zákazník" v={session.customer_name ?? "—"} />
            <Row k="E-mail" v={session.customer_email ?? "—"} />
            <Row k="Zprostředkovatel" v={session.mediator_name ?? "—"} />
          </dl>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-medium mb-3">Akce</h2>
          <div className="space-y-2 text-sm">
            <button onClick={refresh} disabled={busy} className="w-full rounded-md border border-[var(--border)] px-3 py-2 hover:bg-gray-50 disabled:opacity-60">
              Obnovit stav
            </button>
            <button onClick={() => setPolling((p) => !p)} className="w-full rounded-md border border-[var(--border)] px-3 py-2 hover:bg-gray-50">
              {polling ? "Pozastavit auto-obnovu" : "Spustit auto-obnovu"}
            </button>
            <button onClick={() => reject(false)} disabled={busy || session.rejected} className="w-full rounded-md border border-rose-300 px-3 py-2 text-rose-700 hover:bg-rose-50 disabled:opacity-60">
              Zamítnout
            </button>
            <button onClick={() => reject(true)} disabled={busy || session.rejected} className="w-full rounded-md border border-rose-300 px-3 py-2 text-rose-700 hover:bg-rose-50 disabled:opacity-60">
              Zamítnout (GDPR)
            </button>
          </div>
          {err && <p className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-800">{err}</p>}
        </div>

        {statusJson !== null && (
          <details className="rounded-lg border border-[var(--border)] bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">Surová odpověď /get/status</summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded bg-gray-900 p-3 text-[11px] text-gray-100">
              {JSON.stringify(statusJson, null, 2)}
            </pre>
          </details>
        )}
      </aside>
    </div>
  );
}

function InAppSigningPanel({ accessUrl }: { accessUrl: string }) {
  const [opened, setOpened] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-medium">Podpis v aplikaci</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          inSign generuje <strong>jednorázový</strong> odkaz. Lze ho otevřít pouze jednou — proto neukládáme do iframe.
          Otevřete ho v novém okně, dokončete podpis tam a vraťte se sem; stav se sám aktualizuje přes webhook.
        </p>
      </div>

      {!opened ? (
        <div className="p-6 text-center">
          <button
            onClick={() => {
              window.open(accessUrl, "_blank", "noopener,noreferrer");
              setOpened(true);
            }}
            className="inline-flex items-center rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            Otevřít podepisovací okno ↗
          </button>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Tlačítko otevře <code className="text-[10px]">{new URL(accessUrl).host}</code> v novém panelu prohlížeče.
          </p>
        </div>
      ) : (
        <div className="p-6 text-center">
          <p className="text-sm">Podepisovací okno bylo otevřeno.</p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Dokončete podpis v otevřeném panelu. Tato stránka se auto-obnovuje a po přijetí webhooku zobrazí podepsaný dokument.
          </p>
          <a
            href={accessUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block text-xs text-[var(--accent)] hover:underline"
            onClick={(e) => {
              if (!confirm("Pozor: odkaz je jednorázový. Pokud jste ho už použili, druhé otevření selže (599 Vorgang nicht mehr vorhanden). Pokračovat?")) {
                e.preventDefault();
              }
            }}
          >
            Otevřít znovu (na vlastní riziko)
          </a>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className="text-right font-medium truncate">{v}</dd>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
