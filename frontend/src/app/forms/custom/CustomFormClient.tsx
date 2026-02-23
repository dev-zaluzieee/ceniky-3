"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitForm, updateForm } from "@/lib/forms-api";
import { getPricingFormById } from "@/lib/pricing-forms-api";
import DynamicProductForm, { buildInitialFormData } from "@/components/forms/DynamicProductForm";
import type { ProductPayload } from "@/types/json-schema-form.types";
import type { CustomFormJson, JsonSchemaFormData } from "@/types/json-schema-form.types";

export interface CustomFormClientProps {
  /** Create mode: no formId, orderId required. Edit mode: formId + orderId. */
  orderId: number;
  formId?: number;
  /** Create: undefined. Edit: { schema, data } from stored form_json */
  initialData?: CustomFormJson;
  /** Prefill customer from order (create mode) */
  customerFromOrder?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  };
  /** Create from catalog: fetch form by OVT pricing id and use ovt_export_json as schema (skip paste step) */
  pricingId?: string;
}

/**
 * Validates that parsed JSON has product_code, enums, and form_body.Properties.
 */
function validatePayload(data: unknown): data is ProductPayload {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.product_code !== "string" || !d.enums || typeof d.enums !== "object") return false;
  const formBody = d.form_body as { Properties?: unknown[] } | undefined;
  return Boolean(formBody && Array.isArray(formBody.Properties) && formBody.Properties.length > 0);
}

export default function CustomFormClient({
  orderId,
  formId,
  initialData,
  customerFromOrder,
  pricingId,
}: CustomFormClientProps) {
  const router = useRouter();
  const isEditMode = Boolean(formId && initialData);

  /* Create mode: step 1 = paste JSON or load from pricingId, step 2 = form */
  const [rawJson, setRawJson] = useState<string>("");
  const [schema, setSchema] = useState<ProductPayload | null>(() => initialData?.schema ?? null);
  const [formData, setFormData] = useState<JsonSchemaFormData | null>(() => {
    if (initialData?.data) return initialData.data;
    return null;
  });
  /** When creating from catalog (pricingId), loading or error state */
  const [pricingLoadError, setPricingLoadError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  /** Create from catalog: fetch OVT form and set schema + formData so we skip paste step */
  useEffect(() => {
    if (!pricingId?.trim() || formId || initialData) return;
    let cancelled = false;
    setPricingLoadError(null);
    setPricingLoading(true);
    (async () => {
      const res = await getPricingFormById(pricingId.trim());
      if (cancelled) return;
      setPricingLoading(false);
      if (!res.success || !res.data) {
        setPricingLoadError(res.error ?? "Formulář se nepodařilo načíst.");
        return;
      }
      const payload = res.data.ovt_export_json;
      if (!validatePayload(payload)) {
        setPricingLoadError("Export formuláře nemá platnou strukturu (product_code, form_body.Properties).");
        return;
      }
      setSchema(payload as ProductPayload);
      setFormData(buildInitialFormData(payload as ProductPayload, customerFromOrder));
    })();
    return () => {
      cancelled = true;
    };
  }, [pricingId, formId, initialData, customerFromOrder]);

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

  const parsed = useMemo(() => {
    if (!rawJson.trim()) return { ok: true as const, value: null as unknown };
    try {
      return { ok: true as const, value: JSON.parse(rawJson) as unknown };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Neplatný JSON",
      };
    }
  }, [rawJson]);

  const payloadFromPaste = useMemo((): ProductPayload | null => {
    if (!parsed.ok || !parsed.value) return null;
    return validatePayload(parsed.value) ? (parsed.value as ProductPayload) : null;
  }, [parsed]);

  /** Create mode: go from paste step to form step */
  const handleGenerateForm = () => {
    if (!payloadFromPaste) return;
    setSchema(payloadFromPaste);
    setFormData(buildInitialFormData(payloadFromPaste, customerFromOrder));
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const payload = schema;
    const data = formData;
    if (!payload || !data) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const formJson: CustomFormJson = { schema: payload, data };
      if (isEditMode && formId != null) {
        const result = await updateForm(formId, formJson);
        if (result.success) {
          router.push(`/orders/${orderId}`);
          return;
        }
        setSubmitError(result.error ?? "Uložení se nepodařilo.");
      } else {
        const result = await submitForm("custom", formJson, orderId);
        if (result.success) {
          router.push(`/orders/${orderId}`);
          return;
        }
        setSubmitError(result.error ?? "Uložení se nepodařilo.");
      }
    } catch (e) {
      setSubmitError("Došlo k neočekávané chybě.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* Edit mode: we have schema + formData from initialData */
  if (isEditMode && schema && formData) {
    return (
      <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <Link
              href={`/orders/${orderId}`}
              className="flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zpět na zakázku
            </Link>
          </div>
          <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Upravit vlastní formulář
          </h1>
          {submitError && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}
          <DynamicProductForm
            payload={schema}
            formData={formData}
            setFormData={setFormDataForForm}
            actionsFooter={
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {isSubmitting ? "Ukládám…" : "Uložit formulář"}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  /* Create mode: loading from catalog (pricingId) */
  if (pricingId && pricingLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <Link
            href={`/orders/${orderId}`}
            className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zpět na zakázku
          </Link>
          <p className="text-zinc-600 dark:text-zinc-400">Načítám formulář z katalogu…</p>
        </div>
      </div>
    );
  }

  /* Create mode: error loading from catalog */
  if (pricingId && pricingLoadError) {
    return (
      <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <Link
            href={`/orders/${orderId}`}
            className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zpět na zakázku
          </Link>
          <p className="mb-4 text-red-600 dark:text-red-400">{pricingLoadError}</p>
          <Link
            href={`/orders/${orderId}/forms/create/custom`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
          >
            Vložit JSON ručně
          </Link>
        </div>
      </div>
    );
  }

  /* Create mode: step 1 – paste JSON */
  if (!schema || !formData) {
    return (
      <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex items-center justify-between">
            <Link
              href={`/orders/${orderId}`}
              className="flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Zpět na zakázku
            </Link>
          </div>
          <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Vlastní formulář (JSON)
          </h1>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Vložte JSON schéma produktu (stejné jako v debug nástroji). Po validaci vygenerujete
            formulář a vyplníte ho.
          </p>
          <section className="rounded-xl border border-foreground/10 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Vstupní JSON</h2>
              <span className="text-xs">
                {!rawJson.trim() ? (
                  "Čekám na vložení…"
                ) : parsed.ok && payloadFromPaste ? (
                  <span className="text-green-600 dark:text-green-400">✓ Validní</span>
                ) : parsed.ok ? (
                  <span className="text-amber-600 dark:text-amber-400">Chybí form_body.Properties</span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">Neplatný JSON</span>
                )}
              </span>
            </div>
            <textarea
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              spellCheck={false}
              className="h-[360px] w-full resize-y rounded-lg border border-zinc-300 bg-zinc-950 p-4 font-mono text-xs text-zinc-100 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-600"
              placeholder='Vložte JSON s product_code, form_body.Properties, enums…'
            />
            {!parsed.ok && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{parsed.error}</p>}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleGenerateForm}
                disabled={!payloadFromPaste}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vygenerovat formulář
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* Create mode: step 2 – form */
  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={`/orders/${orderId}`}
            className="flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zpět na zakázku
          </Link>
        </div>
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Vlastní formulář – vyplnění
        </h1>
        {submitError && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{submitError}</p>
        )}
        <DynamicProductForm
          payload={schema}
          formData={formData}
          setFormData={setFormDataForForm}
          actionsInRoomsHeader={
            <button
              type="button"
              onClick={() => {
                setSchema(null);
                setFormData(null);
              }}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            >
              Zpět k JSON
            </button>
          }
          actionsFooter={
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {isSubmitting ? "Ukládám…" : "Uložit formulář"}
            </button>
          }
        />
      </div>
    </div>
  );
}
