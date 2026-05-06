"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DeliveryMode = "inapp" | "extern";

export default function NewSessionForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<DeliveryMode>("inapp");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        deliveryMode: mode,
        customerName: String(fd.get("customerName") ?? ""),
        customerEmail: String(fd.get("customerEmail") ?? ""),
        customerPhone: String(fd.get("customerPhone") ?? ""),
        mediatorName: String(fd.get("mediatorName") ?? ""),
        mediatorEmail: String(fd.get("mediatorEmail") ?? ""),
        inOrder: fd.get("inOrder") === "on",
        smsOnly: fd.get("smsOnly") === "on",
      };
      const res = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.stack) console.error("server stack:", json.stack);
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      router.push(`/sessions/${json.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "neznámá chyba");
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const labelCls = "block text-xs font-medium text-[var(--muted)] mb-1";

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-[var(--border)] bg-white p-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Režim doručení</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" value="inapp" checked={mode === "inapp"} onChange={() => setMode("inapp")} />
            V aplikaci (iframe na <code className="text-xs">accessURL</code>)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" value="extern" checked={mode === "extern"} onChange={() => setMode("extern")} />
            Email / SMS (odkaz odešle inSign)
          </label>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4">
        <legend className="col-span-2 text-sm font-medium">Zákazník</legend>
        <div>
          <label className={labelCls}>Jméno</label>
          <input className={inputCls} name="customerName" defaultValue="Jan Novák" required />
        </div>
        <div>
          <label className={labelCls}>E-mail</label>
          <input className={inputCls} name="customerEmail" type="email" defaultValue={defaultEmail} required={mode === "extern"} />
        </div>
        <div>
          <label className={labelCls}>Telefon (volitelně, povolí SMS)</label>
          <input className={inputCls} name="customerPhone" placeholder="+420 …" />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4">
        <legend className="col-span-2 text-sm font-medium">Zprostředkovatel</legend>
        <div>
          <label className={labelCls}>Jméno</label>
          <input className={inputCls} name="mediatorName" defaultValue="Karel Křesťan" />
        </div>
        <div>
          <label className={labelCls}>E-mail</label>
          <input className={inputCls} name="mediatorEmail" type="email" defaultValue={defaultEmail} required={mode === "extern"} />
        </div>
      </fieldset>

      {mode === "extern" && (
        <fieldset className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inOrder" defaultChecked />
            Postupně (zákazník → zprostředkovatel)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="smsOnly" />
            Pouze SMS (vyžaduje telefon)
          </label>
        </fieldset>
      )}

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <div className="flex items-center justify-between">
        <a href="/api/preview-pdf" target="_blank" className="text-sm text-[var(--accent)] hover:underline">
          Náhled vygenerovaného PDF →
        </a>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Vytvářím…" : "Vytvořit sezení"}
        </button>
      </div>
    </form>
  );
}
