import NewSessionForm from "./NewSessionForm";
import { env } from "@/lib/env";

export default function NewSessionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nové sezení</h1>
        <p className="text-sm text-[var(--muted)]">
          Vygeneruje ADMF PDF s placeholder daty a založí podepisovací sezení v inSign.
        </p>
      </div>

      <NewSessionForm defaultEmail={env.defaults.recipientEmail()} />

      <div className="rounded-md border border-[var(--border)] bg-white p-4 text-xs text-[var(--muted)]">
        <p className="font-medium text-[var(--fg)]">Co se stane po odeslání:</p>
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>Backend vygeneruje PDF (markery <code>__SIG_CUSTOMER__</code>, <code>__SIG_MEDIATOR__</code>).</li>
          <li>Volá <code>POST /configure/session</code> v inSign — předává PDF jako BASE64 a definuje pole podpisů přes <code>textsearch</code>.</li>
          <li>U režimu „V aplikaci" se otevře iframe s vrácenou <code>accessURL</code>.</li>
          <li>U režimu „Email/SMS" zavolá <code>POST /extern/beginmulti</code> a inSign rozešle podepisovací odkazy.</li>
        </ol>
      </div>
    </div>
  );
}
