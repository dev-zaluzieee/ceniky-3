"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      const schemaWithPricingId: ProductPayload = {
        ...(payload as ProductPayload),
        _product_pricing_id: pricingId.trim(),
      };
      setSchema(schemaWithPricingId);
      setFormData(buildInitialFormData(schemaWithPricingId, customerFromOrder));
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
  const [hasSizeLimitError, setHasSizeLimitError] = useState(false);
  const [hasWarrantyError, setHasWarrantyError] = useState(false);

  /** Track unsaved changes: set true on any formData change after initial load */
  const [isDirty, setIsDirty] = useState(false);
  const initialFormDataRef = useRef<string | null>(null);

  useEffect(() => {
    if (formData && initialFormDataRef.current === null) {
      initialFormDataRef.current = JSON.stringify(formData);
    }
  }, [formData]);

  useEffect(() => {
    if (!formData || initialFormDataRef.current === null) return;
    setIsDirty(JSON.stringify(formData) !== initialFormDataRef.current);
  }, [formData]);

  const handleSizeLimitErrorChange = useCallback((hasError: boolean) => {
    setHasSizeLimitError(hasError);
  }, []);

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

  /** Product title for header */
  const productTitle = formData?.productName || formData?.productCode || schema?.product_code || "";

  /** Back link element (reused) */
  const backLink = (
    <Link
      href={`/orders/${orderId}`}
      className="inline-flex items-center gap-2 py-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Zpět do zakázky
    </Link>
  );

  /** Bottom save bar content */
  const saveBar = (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="mx-auto flex max-w-7xl items-center justify-center">
        {hasSizeLimitError ? (
          <div className="rounded-md bg-red-500 px-6 py-3 text-center text-sm font-medium text-white">
            Některé položky z formuláře nelze vyrobit
          </div>
        ) : hasWarrantyError ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-h-[44px] touch-manipulation rounded-md bg-amber-600 px-6 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {isSubmitting ? "Ukládám…" : "Uložit formulář i s produkty bez záruky"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-h-[44px] touch-manipulation rounded-md bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {isSubmitting ? "Ukládám…" : "Uložit formulář"}
          </button>
        )}
      </div>
    </div>
  );

  /** Title with unsaved changes badge */
  const titleSection = (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {productTitle ? `VÝROBNÍ DOKUMENTACE - ${productTitle}` : "VÝROBNÍ DOKUMENTACE"}
      </h1>
      {isDirty && (
        <span className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-400">
          některé změny nejsou uloženy
        </span>
      )}
    </div>
  );

  /* Edit mode: we have schema + formData from initialData */
  if (isEditMode && schema && formData) {
    return (
      <div className="min-h-screen bg-zinc-50 pb-24 pt-6 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3">{backLink}</div>
          {titleSection}
          {submitError && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}
          <DynamicProductForm
            payload={schema}
            formData={formData}
            setFormData={setFormDataForForm}
            onSizeLimitErrorChange={handleSizeLimitErrorChange}
            onWarrantyErrorChange={setHasWarrantyError}
          />
        </div>
        {saveBar}
      </div>
    );
  }

  /* Create mode: loading from catalog (pricingId) */
  if (pricingId && pricingLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3">{backLink}</div>
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
          <div className="mb-3">{backLink}</div>
          <p className="mb-4 text-red-600 dark:text-red-400">{pricingLoadError}</p>
        </div>
      </div>
    );
  }

  /* Create mode: step 1 – paste JSON */
  if (!schema || !formData) {
    return (
      <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-3">{backLink}</div>
          <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Výrobní dokumentace (JSON)
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
                  <span className="text-green-600 dark:text-green-400">Validní</span>
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
    <div className="min-h-screen bg-zinc-50 pb-24 pt-6 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-3">{backLink}</div>
        {titleSection}
        {submitError && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{submitError}</p>
        )}
        <DynamicProductForm
          payload={schema}
          formData={formData}
          setFormData={setFormDataForForm}
          onSizeLimitErrorChange={handleSizeLimitErrorChange}
          onWarrantyErrorChange={setHasWarrantyError}
        />
      </div>
      {saveBar}
    </div>
  );
}
