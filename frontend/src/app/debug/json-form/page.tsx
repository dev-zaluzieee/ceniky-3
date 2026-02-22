"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { JsonSchemaFormData, ProductPayload, PropertyDefinition } from "@/types/json-schema-form.types";
import DynamicProductForm, { buildInitialFormData } from "@/components/forms/DynamicProductForm";

/**
 * Debug tool: paste a product JSON payload (from the experimental validation app)
 * and generate a dynamic form from it.
 *
 * Important: we intentionally do NOT fetch anything from Supabase here. The input is
 * copy/paste JSON so we can iterate on the schema + UI quickly and deterministically.
 */
export default function DebugJsonFormPage() {
  const [rawJson, setRawJson] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ReturnType<typeof buildInitialFormData> | null>(null);

  /** Setter compatible with DynamicProductForm (only updates when formData is non-null) */
  const setFormDataForForm = useCallback(
    (action: React.SetStateAction<JsonSchemaFormData>) => {
      setFormData((prev) => {
        if (prev === null) return prev;
        return typeof action === "function" ? action(prev) : action;
      });
    },
    []
  );

  /**
   * Parse JSON in a safe, UI-friendly way (no throwing during render).
   */
  const parsed = useMemo(() => {
    if (!rawJson.trim()) return { ok: true as const, value: null as unknown };
    try {
      return { ok: true as const, value: JSON.parse(rawJson) as unknown };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Neplatný JSON";
      return { ok: false as const, error: message };
    }
  }, [rawJson]);

  /**
   * Validate payload structure (new format: zahlavi / form_body / zapati + enums)
   */
  const payload = useMemo((): ProductPayload | null => {
    if (!parsed.ok || !parsed.value) return null;
    const data = parsed.value as any;
    if (typeof data.product_code !== "string" || !data.enums || typeof data.enums !== "object")
      return null;
    // At least form_body with Properties is required for the row table
    const hasFormBody = data.form_body && Array.isArray(data.form_body.Properties) && data.form_body.Properties.length > 0;
    if (!hasFormBody) return null;
    return data as ProductPayload;
  }, [parsed]);

  /** Row columns from form_body (for validation message in JSON section) */
  const formBodyProperties = useMemo(
    () => (payload?.form_body?.Properties ?? []) as PropertyDefinition[],
    [payload]
  );

  /** Initialize form from payload and show form view */
  const handleGenerateForm = () => {
    if (!payload) return;
    setFormData(buildInitialFormData(payload));
    setShowForm(true);
  };

  /** Export form data as JSON (for debugging/inspection) */
  const handleExportData = () => {
    if (!formData) return;
    const json = JSON.stringify(formData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formData.productCode}_form_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        {/* Header with back link */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Zpět na hlavní stránku
          </Link>
        </div>

        {/* Page Title */}
        <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Náhled JSON formuláře
        </h1>

        {!showForm ? (
          /* JSON Input Section */
          <section
            className="rounded-xl border border-foreground/10 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
            aria-label="Vstupní JSON"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Vstupní JSON
              </h2>
              <div className="text-xs text-foreground/70">
                {rawJson.trim().length === 0 ? (
                  <span>Čekám na vložení…</span>
                ) : parsed.ok && payload ? (
                  <span className="text-green-600 dark:text-green-400">
                    ✓ JSON je validní (form_body: {formBodyProperties.length}
                    {payload.zahlavi ? `, zahlavi: ${payload.zahlavi.Properties.length}` : ""}
                    {payload.zapati ? `, zapati: ${payload.zapati.Properties.length}` : ""})
                  </span>
                ) : parsed.ok ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    ⚠ Chybí form_body.Properties (nebo je prázdné)
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">
                    ✗ JSON je neplatný
                  </span>
                )}
              </div>
            </div>

            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="h-[400px] w-full resize-y rounded-lg border border-zinc-300 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-600"
              placeholder={`Vložte sem JSON payload…\n\nOčekávaná struktura:\n{\n  "product_code": "...",\n  "zahlavi": { "Properties": [...] },\n  "form_body": { "Properties": [...] },\n  "zapati": { "Properties": [...] },\n  "enums": {...}\n}`}
            />

            {!parsed.ok && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                Chyba parsování: {parsed.error}
              </p>
            )}

            {parsed.ok && !payload && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                JSON je validní, ale chybí očekávaná struktura: product_code,
                enums a form_body s neprázdným polem Properties.
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerateForm}
                disabled={!payload}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vygenerovat formulář
              </button>
            </div>
          </section>
        ) : (
          /* Form Section – shared DynamicProductForm + debug-only data preview */
          <div className="space-y-6">
            {payload && formData && (
              <DynamicProductForm
                payload={payload}
                formData={formData}
                setFormData={setFormDataForForm}
                actionsInRoomsHeader={
                  <>
                    <button
                      type="button"
                      onClick={handleExportData}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                    >
                      Exportovat data
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setFormData(null);
                      }}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                    >
                      Zpět k JSON
                    </button>
                  </>
                }
              />
            )}
            {/* Debug-only: data preview */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Náhled dat (mistnosti)
              </h2>
              <pre className="max-h-[400px] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                {JSON.stringify(formData?.rooms ?? [], null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
