"use client";

import React from "react";

interface ExportTargetResult {
  success: boolean;
  logId?: number;
  exportedAt?: string;
  warnings?: Array<{ code: string; field: string; reason: string }>;
  error?: string;
}

export interface ExportResult {
  exportBatchId: string;
  testMode: boolean;
  raynet: ExportTargetResult;
  erp: ExportTargetResult;
}

type ExportLogRecord = {
  id: number;
  status: string;
  test_mode: boolean;
  request_payload: Record<string, unknown> | null;
  warnings: Array<{ code: string; field: string; reason: string }> | null;
  created_at: string | Date;
  completed_at: string | Date | null;
};

interface ExportStatusModalProps {
  result: ExportResult | null;
  loading: boolean;
  formId?: number | null;
  onClose: () => void;
}

function TargetStatus({ name, data }: { name: string; data: ExportTargetResult }) {
  const warningsFiltered = (data.warnings ?? []).filter(
    (w) => w.code !== "PRODUCTS_SKIPPED"
  );

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        {data.success ? (
          <svg className="h-5 w-5 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-5 w-5 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        <span className={`text-sm font-semibold ${data.success ? "text-green-400" : "text-red-400"}`}>
          {name}
        </span>
        <span className={`ml-auto text-xs ${data.success ? "text-zinc-400" : "text-red-300"}`}>
          {data.success ? "OK" : "Chyba"}
        </span>
      </div>

      {data.success && data.exportedAt && (
        <p className="text-xs text-zinc-400">
          Exportováno: {new Date(data.exportedAt).toLocaleString("cs-CZ")}
        </p>
      )}

      {!data.success && data.error && (
        <p className="mt-1 text-xs text-red-300">{data.error}</p>
      )}

      {warningsFiltered.length > 0 && (
        <div className="mt-2 space-y-1">
          {warningsFiltered.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400">
              <svg className="mt-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{w.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string | undefined | null): string {
  if (!status) return "";
  if (status === "SUCCESS") return "OK";
  if (status === "PARTIAL_SUCCESS") return "Částečně OK";
  if (status === "FAILED") return "Chyba";
  if (status === "SENDING" || status === "PENDING" || status === "MAPPING") return "Probíhá";
  return status;
}

export default function ExportStatusModal({ result, loading, formId, onClose }: ExportStatusModalProps) {
  const allSuccess = result?.raynet.success && result?.erp.success;
  const [latestRaynetLog, setLatestRaynetLog] = React.useState<ExportLogRecord | null>(null);
  const [latestErpLog, setLatestErpLog] = React.useState<ExportLogRecord | null>(null);

  React.useEffect(() => {
    if (!loading) return;
    if (!formId) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/forms/${formId}/export-latest`, { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json?.success) return;
        if (cancelled) return;
        setLatestRaynetLog(json.data?.raynet ?? null);
        setLatestErpLog(json.data?.erp ?? null);
      } catch {
        // ignore polling errors
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loading, formId]);

  const raynetProgress = (latestRaynetLog?.request_payload as any)?.attachments_summary as
    | { enabled?: boolean; total?: number; uploaded?: number; failed?: number }
    | undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-status-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-800 p-6 shadow-xl">
        <h2 id="export-status-title" className="mb-4 text-lg font-semibold text-zinc-50">
          {loading ? "Exportuji..." : "Výsledek exportu"}
        </h2>

        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <svg className="h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-zinc-400">Synchronizuji data s Raynetem a ERP...</p>

            {(latestRaynetLog || latestErpLog) && (
              <div className="mt-2 w-full max-w-sm space-y-2">
                {latestRaynetLog && (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-xs text-zinc-300">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">Raynet</span>
                      <span className="text-zinc-400">{statusLabel(latestRaynetLog.status)}</span>
                    </div>
                    {raynetProgress?.enabled && typeof raynetProgress.total === "number" && (
                      <div className="mt-1 text-zinc-400">
                        Přílohy: {raynetProgress.uploaded ?? 0}/{raynetProgress.total} hotovo
                        {(raynetProgress.failed ?? 0) > 0 ? `, chyby: ${raynetProgress.failed}` : ""}
                      </div>
                    )}
                  </div>
                )}

                {latestErpLog && (
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/30 px-3 py-2 text-xs text-zinc-300">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-200">ERP</span>
                      <span className="text-zinc-400">{statusLabel(latestErpLog.status)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!loading && result && (
          <>
            {result.testMode && (
              <div className="mb-4 rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2">
                <p className="text-xs font-semibold text-amber-400">Testovaci rezim — data nebyla odeslana</p>
              </div>
            )}

            <div className="space-y-3">
              <TargetStatus name="Raynet" data={result.raynet} />
              <TargetStatus name="ERP (Systeeem)" data={result.erp} />
            </div>

            {allSuccess && (
              <div className="mt-4 rounded-lg border border-green-700/50 bg-green-900/20 px-3 py-2">
                <p className="text-xs text-green-400">Vsechny exporty probehly uspesne.</p>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
              >
                Zavrit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
