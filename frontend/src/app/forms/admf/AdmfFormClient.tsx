"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitForm, updateForm } from "@/lib/forms-api";
import { generateAdmfPdf } from "@/lib/admf-pdf";
import type { AdmfFormData, AdmfProductRow, AdmfVatRate } from "@/types/forms/admf.types";

/** Today in YYYY-MM-DD for date input default */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Customer data from order */
interface CustomerFromOrder {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipcode?: string;
}

interface AdmfFormClientProps {
  initialData?: AdmfFormData;
  formId?: number;
  orderId?: number;
  customerFromOrder?: CustomerFromOrder;
}

const defaultProductRow = (): AdmfProductRow => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  produkt: "",
  ks: 1,
  ram: "",
  lamelaLatka: "",
  cena: 0,
  sleva: 0,
  cenaPoSleve: 0,
});

function getDefaultFormData(): AdmfFormData {
  return {
    name: "Varianta 1",
    source_form_ids: [],
    productRows: [],
    montazCenaBezDph: 1339,
    poznamkyVyroba: "",
    poznamkyMontaz: "",
    platceDph: false,
    faktura: true,
    nebytovyProstor: false,
    bytovyProstor: true,
    vatRate: 12,
    zalohovaFaktura: 0,
    datum: todayString(),
    typZarizeni: "Byt",
    parkovani: true,
    zv: "?",
    maZakaznikVyfocenouLamelu: true,
    kObjednani: "Celá zakázka",
    zalohaZaplacena: "Hotově",
  };
}

function recalcCenaPoSleve(row: AdmfProductRow): number {
  return Math.round(row.cena * (1 - row.sleva / 100));
}

/* ── Reusable UI helpers ──────────────────────────────────── */

/** Collapsible section card matching DynamicProductForm pattern */
function CollapsibleSection({
  title,
  headerRight,
  defaultOpen = true,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
          {headerRight}
        </div>
        <svg
          className={`h-5 w-5 text-zinc-400 transition-transform ${open ? "rotate-0" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      {open && <div className="border-t border-zinc-700 px-5 py-5">{children}</div>}
    </div>
  );
}

/** Ano/Ne toggle button (pill style, iPad-friendly 44px min) */
function ToggleButton({
  value,
  onChange,
  labelTrue = "Ano",
  labelFalse = "Ne",
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  labelTrue?: string;
  labelFalse?: string;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-zinc-600">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`min-h-[44px] min-w-[72px] px-4 py-2.5 text-sm font-medium transition-colors ${
          value
            ? "bg-primary text-white"
            : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
        }`}
      >
        {labelTrue}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`min-h-[44px] min-w-[72px] px-4 py-2.5 text-sm font-medium transition-colors ${
          !value
            ? "bg-primary text-white"
            : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
        }`}
      >
        {labelFalse}
      </button>
    </div>
  );
}

/** Standard form input styling */
const inputCls =
  "w-full max-w-full appearance-none rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2.5 text-sm text-zinc-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const selectCls =
  "w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2.5 text-sm text-zinc-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelCls = "mb-1.5 block text-sm font-medium text-zinc-200";

/* ── Main component ───────────────────────────────────────── */

export default function AdmfFormClient({
  initialData,
  formId,
  orderId,
  customerFromOrder,
}: AdmfFormClientProps) {
  const isEditMode = !!formId && !!initialData;
  const [formData, setFormData] = useState<AdmfFormData>(() => {
    if (initialData) {
      return {
        ...getDefaultFormData(),
        ...initialData,
        productRows: (initialData.productRows || []).map((r) => ({
          ...defaultProductRow(),
          ...r,
          id: r.id || defaultProductRow().id,
        })),
      };
    }
    const d = getDefaultFormData();
    if (customerFromOrder) {
      d.jmenoPrijmeni = customerFromOrder.name ?? "";
      d.email = customerFromOrder.email ?? "";
      d.telefon = customerFromOrder.phone ?? "";
      d.ulice = customerFromOrder.address ?? "";
      d.mesto = customerFromOrder.city ?? "";
      d.psc = customerFromOrder.zipcode ?? "";
    }
    return d;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  /** Dirty state tracking */
  const [isDirty, setIsDirty] = useState(false);
  const initialFormDataRef = useRef<string | null>(null);
  const latestFormDataRef = useRef(formData);
  useEffect(() => {
    latestFormDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    if (formData && initialFormDataRef.current === null) {
      initialFormDataRef.current = JSON.stringify(formData);
    }
  }, [formData]);
  useEffect(() => {
    if (!formData || initialFormDataRef.current === null) return;
    setIsDirty(JSON.stringify(formData) !== initialFormDataRef.current);
  }, [formData]);

  const updateField = useCallback(
    <K extends keyof AdmfFormData,>(key: K, value: AdmfFormData[K]) => {
      setFormData((p) => ({ ...p, [key]: value }));
    },
    []
  );

  const updateProductRow = (id: string, upd: Partial<AdmfProductRow>) => {
    setFormData((prev) => ({
      ...prev,
      productRows: prev.productRows.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...upd };
        if ("cena" in upd || "sleva" in upd) {
          next.cenaPoSleve = recalcCenaPoSleve(next);
        }
        return next;
      }),
    }));
  };

  const addProductRow = () => {
    setFormData((prev) => ({
      ...prev,
      productRows: [...prev.productRows, defaultProductRow()],
    }));
  };

  const removeProductRow = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      productRows: prev.productRows.filter((r) => r.id !== id),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    const totalB =
      formData.productRows.reduce(
        (s, r) => s + (r.cenaPoSleve || 0) * (r.ks || 1),
        0
      ) + (formData.montazCenaBezDph ?? 1339);
    const vat = (formData.vatRate ?? 12) as AdmfVatRate;
    const totalS = Math.round(totalB * (1 + vat / 100));
    const zaloha = formData.zalohovaFaktura ?? 0;
    const dataToSave: AdmfFormData = {
      ...formData,
      doplatek: Math.max(0, totalS - zaloha),
    };
    try {
      if (isEditMode && formId) {
        const res = await updateForm(formId, dataToSave);
        if (!res.success) {
          setSubmitError(res.error ?? "Uložení se nepodařilo.");
          return;
        }
        setSubmitSuccess(true);
        const submittedSnapshot = JSON.stringify(formData);
        initialFormDataRef.current = submittedSnapshot;
        // Preserve dirty=true when user changed fields while save was in flight.
        setIsDirty(JSON.stringify(latestFormDataRef.current) !== submittedSnapshot);
      } else {
        if (orderId == null) {
          setSubmitError("Zakázka není vybrána.");
          return;
        }
        const res = await submitForm("admf", dataToSave, orderId);
        if (!res.success) {
          setSubmitError(res.error ?? "Odeslání se nepodařilo.");
          return;
        }
        setSubmitSuccess(true);
        if (res.data?.id) {
          window.location.href = `/orders/${orderId}/forms/${res.data.id}`;
        }
      }
    } catch (err: any) {
      setSubmitError(err?.message ?? "Chyba při ukládání.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Computed values ──────────────────────────────────── */
  const totalProduktyBezDph = formData.productRows.reduce(
    (sum, r) => sum + (r.cenaPoSleve || 0) * (r.ks || 1),
    0
  );
  const montazBezDph = formData.montazCenaBezDph ?? 1339;
  const totalBezDph = totalProduktyBezDph + montazBezDph;
  const vatRate = (formData.vatRate ?? 12) as AdmfVatRate;
  const totalSDph = Math.round(totalBezDph * (1 + vatRate / 100));
  const zalohovaFaktura = formData.zalohovaFaktura ?? 0;
  const minZaloha = Math.round(0.5 * totalSDph);
  const zalohaTooLow = totalSDph > 0 && zalohovaFaktura < minZaloha;
  const doplatek = Math.max(0, totalSDph - zalohovaFaktura);

  // Column labels from price-affecting fields
  const firstRowWithPriceFields = formData.productRows.find(
    (r) => (r.priceAffectingFields?.length ?? 0) > 0
  );
  const priceField1Label =
    firstRowWithPriceFields?.priceAffectingFields?.[0]?.label ?? "Rám";
  const priceField2Label =
    firstRowWithPriceFields?.priceAffectingFields?.[1]?.label ?? "Lamela/Látka";

  /** Generate PDF and open in new tab */
  const handleShowPreview = async () => {
    setPdfError(null);
    setPdfLoading(true);
    try {
      const doc = await generateAdmfPdf(formData);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Nepodařilo se vygenerovat PDF.";
      setPdfError(message);
    } finally {
      setPdfLoading(false);
    }
  };

  const SLEVA_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

  return (
    <div className="min-h-screen bg-zinc-900 pb-24 pt-6 px-4">
      <div className="mx-auto max-w-7xl">
        {/* ── Header: back link ── */}
        <div className="mb-3">
          <Link
            href={orderId != null ? `/orders/${orderId}` : "/"}
            className="inline-flex items-center gap-2 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Zpět do zakázky
          </Link>
        </div>

        {/* ── Title bar: title + save badge + action buttons ── */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-50">
            Administrativní formulář (ADMF)
          </h1>
          {submitSuccess && !isDirty ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-600 bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              všechny změny uloženy
            </span>
          ) : isDirty ? (
            <span className="rounded-md border border-amber-400 bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-400">
              neuložené změny
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleShowPreview}
              disabled={pdfLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {pdfLoading ? "Generuji PDF…" : "Otevřít PDF"}
            </button>
            {pdfError && (
              <p className="text-sm text-red-400">{pdfError}</p>
            )}
            <button
              type="button"
              onClick={() => setShowSendModal(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Odeslat zákazníkovi
            </button>
          </div>
        </div>

        {/* Modal: dev mode – save & send blocked */}
        {showSendModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-modal-title"
          >
            <div className="max-w-md rounded-xl border border-zinc-700 bg-zinc-800 p-6 shadow-xl">
              <h2 id="send-modal-title" className="mb-4 text-lg font-semibold text-zinc-50">
                Odeslat zákazníkovi
              </h2>
              <p className="mb-6 text-sm text-zinc-400">
                V testovacím režimu neodesíláme e-maily zákazníkům ani neukládáme data do ERP a Raynet.
                V režimu vývoje je tato operace blokována.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="min-h-[44px] rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500"
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: e-podpis not available */}
        {showSignModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-modal-title"
          >
            <div className="max-w-md rounded-xl border border-zinc-700 bg-zinc-800 p-6 shadow-xl">
              <h2 id="sign-modal-title" className="mb-4 text-lg font-semibold text-zinc-50">
                E-podpis zákazníka
              </h2>
              <p className="mb-6 text-sm text-zinc-400">
                Funkce elektronického podpisu zatím není k dispozici. Bude implementována v další verzi aplikace.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSignModal(false)}
                  className="min-h-[44px] rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500"
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Název varianty formuláře ── */}
          <div className="rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-5">
            <h2 className="mb-3 text-lg font-semibold text-zinc-50">Název varianty formuláře</h2>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              className={`${inputCls} max-w-md`}
              placeholder="Varianta 1"
            />
          </div>

          {/* ── Údaje zákazníka (ze zakázky) ── */}
          <CollapsibleSection title="Údaje zákazníka (ze zakázky)">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Jméno zákazníka / Název firmy</label>
                <input
                  type="text"
                  value={formData.jmenoPrijmeni ?? ""}
                  onChange={(e) => updateField("jmenoPrijmeni", e.target.value)}
                  className={`${inputCls} max-w-md`}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>IČO</label>
                  <input
                    type="text"
                    value={formData.ico ?? ""}
                    onChange={(e) => updateField("ico", e.target.value)}
                    className={inputCls}
                    placeholder="-"
                  />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input
                    type="email"
                    value={formData.email ?? ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Telefon</label>
                  <input
                    type="tel"
                    value={formData.telefon ?? ""}
                    onChange={(e) => updateField("telefon", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Adresa</label>
                  <input
                    type="text"
                    value={formData.ulice ?? ""}
                    onChange={(e) => updateField("ulice", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Město</label>
                  <input
                    type="text"
                    value={formData.mesto ?? ""}
                    onChange={(e) => updateField("mesto", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>PSČ</label>
                  <input
                    type="text"
                    value={formData.psc ?? ""}
                    onChange={(e) => updateField("psc", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Další informace ── */}
          <CollapsibleSection title="Další informace">
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Typ zařízení</label>
                  <select
                    value={formData.typZarizeni ?? "Byt"}
                    onChange={(e) => updateField("typZarizeni", e.target.value)}
                    className={selectCls}
                  >
                    <option value="Byt">Byt</option>
                    <option value="RD">RD</option>
                    <option value="Firma">Firma</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Parkování</label>
                  <ToggleButton
                    value={formData.parkovani ?? true}
                    onChange={(v) => updateField("parkovani", v)}
                    labelTrue="OK"
                    labelFalse="Špatné"
                  />
                </div>
                <div>
                  <label className={labelCls}>ZV</label>
                  <select
                    value={formData.zv ?? "?"}
                    onChange={(e) => updateField("zv", e.target.value)}
                    className={selectCls}
                  >
                    <option value="?">?</option>
                    <option value="Ano">Ano</option>
                    <option value="Ne">Ne</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Plátce DPH</label>
                  <ToggleButton
                    value={formData.platceDph ?? false}
                    onChange={(v) => updateField("platceDph", v)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nebytový prostor</label>
                  <ToggleButton
                    value={formData.nebytovyProstor ?? false}
                    onChange={(v) => updateField("nebytovyProstor", v)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Bytový prostor</label>
                  <ToggleButton
                    value={formData.bytovyProstor ?? true}
                    onChange={(v) => updateField("bytovyProstor", v)}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Má zákazník vyfocenou lamelu?</label>
                <ToggleButton
                  value={formData.maZakaznikVyfocenouLamelu ?? true}
                  onChange={(v) => updateField("maZakaznikVyfocenouLamelu", v)}
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── DPH ── */}
          <CollapsibleSection title="DPH">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelCls}>Plátce DPH</label>
                <ToggleButton
                  value={formData.platceDph ?? false}
                  onChange={(v) => updateField("platceDph", v)}
                />
              </div>
              <div>
                <label className={labelCls}>Sazba DPH</label>
                <select
                  value={formData.vatRate ?? 12}
                  onChange={(e) =>
                    updateField("vatRate", parseInt(e.target.value, 10) as AdmfVatRate)
                  }
                  className={`${selectCls} max-w-[200px]`}
                >
                  <option value={0}>0%</option>
                  <option value={12}>12%</option>
                  <option value={21}>21%</option>
                </select>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Záznam o jednání – product table ── */}
          <CollapsibleSection
            title="Záznam o jednání"
            headerRight={
              <button
                type="button"
                onClick={addProductRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Přidat řádek
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-600">
                    <th className="px-3 py-3 text-left text-xs font-medium text-zinc-400">Produkt</th>
                    <th className="w-20 px-3 py-3 text-center text-xs font-medium text-zinc-400">Počet ks</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-zinc-400">{priceField1Label}</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-zinc-400">{priceField2Label}</th>
                    <th className="w-28 px-3 py-3 text-right text-xs font-medium text-zinc-400">Cena (bez DPH)</th>
                    <th className="w-24 px-3 py-3 text-right text-xs font-medium text-zinc-400">Sleva %</th>
                    <th className="w-32 px-3 py-3 text-right text-xs font-medium text-zinc-400">Cena po slevě (bez DPH)</th>
                    <th className="w-32 px-3 py-3 text-right text-xs font-medium text-zinc-400">Cena po slevě (s DPH)</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {formData.productRows.map((row) => {
                    const cenaZaKsBezDph = row.cenaPoSleve || 0;
                    const cenaZaKsSDph = Math.round(cenaZaKsBezDph * (1 + vatRate / 100));
                    const surchargeSum =
                      row.surcharges?.reduce((sum, s) => sum + (s.amount || 0), 0) ?? 0;
                    const baseCena =
                      row.baseCena != null ? row.baseCena : Math.max(0, (row.cena || 0) - surchargeSum);
                    const hasSurcharges = (row.surcharges?.length ?? 0) > 0;
                    const hasPriceFields = (row.priceAffectingFields?.length ?? 0) > 0;
                    const field1Value =
                      row.priceAffectingFields?.[0]?.value ?? row.ram;
                    const field2Value =
                      row.priceAffectingFields?.[1]?.value ?? row.lamelaLatka;
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-zinc-700/50">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.produkt}
                              onChange={(e) => updateProductRow(row.id, { produkt: e.target.value })}
                              className={inputCls}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              min={1}
                              value={row.ks}
                              onChange={(e) =>
                                updateProductRow(row.id, { ks: parseInt(e.target.value, 10) || 1 })
                              }
                              className={`${inputCls} w-16 text-center`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {hasPriceFields ? (
                              <span className="text-sm text-zinc-100">{field1Value}</span>
                            ) : (
                              <input
                                type="text"
                                value={row.ram}
                                onChange={(e) => updateProductRow(row.id, { ram: e.target.value })}
                                className={inputCls}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {hasPriceFields ? (
                              <span className="text-sm text-zinc-100">{field2Value}</span>
                            ) : (
                              <input
                                type="text"
                                value={row.lamelaLatka}
                                onChange={(e) =>
                                  updateProductRow(row.id, { lamelaLatka: e.target.value })
                                }
                                className={inputCls}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right align-top">
                            <input
                              type="number"
                              min={0}
                              value={row.cena || ""}
                              onChange={(e) =>
                                updateProductRow(row.id, { cena: parseInt(e.target.value, 10) || 0 })
                              }
                              className={`${inputCls} w-24 text-right`}
                            />
                            {hasSurcharges && (
                              <p className="mt-1 text-[11px] text-zinc-500">
                                Základ: {baseCena}, příplatky: {surchargeSum}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <select
                              value={row.sleva || 0}
                              onChange={(e) =>
                                updateProductRow(row.id, { sleva: parseInt(e.target.value, 10) || 0 })
                              }
                              className={`${selectCls} w-20 text-right`}
                            >
                              {SLEVA_OPTIONS.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-zinc-100 align-top">
                            {cenaZaKsBezDph}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-400 align-top">
                            {cenaZaKsSDph}
                          </td>
                          <td className="px-3 py-2 text-center align-top">
                            <button
                              type="button"
                              onClick={() => removeProductRow(row.id)}
                              className="min-h-[36px] min-w-[36px] rounded-lg text-red-400 hover:bg-red-900/20"
                              title="Odebrat řádek"
                            >
                              <svg className="mx-auto h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                        {hasSurcharges && (
                          <tr className="border-b border-zinc-700/30 bg-zinc-800/60 text-xs text-zinc-400">
                            <td className="px-3 py-2" colSpan={4}>
                              Příplatky:
                            </td>
                            <td className="px-3 py-2" colSpan={3}>
                              <div className="flex flex-wrap gap-3">
                                {row.surcharges?.map((s, idx) => (
                                  <div
                                    key={`${row.id}-s-${s.code}-${idx}`}
                                    className="flex items-center gap-1"
                                  >
                                    <span className="text-[11px] text-zinc-500">
                                      {s.label ?? s.code}:
                                    </span>
                                    <input
                                      type="number"
                                      className="w-20 rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-right text-[11px] text-zinc-50"
                                      value={s.amount}
                                      onChange={(e) => {
                                        const next = (row.surcharges ?? []).map((item, j) =>
                                          j === idx
                                            ? { ...item, amount: parseInt(e.target.value, 10) || 0 }
                                            : item
                                        );
                                        const newSum = next.reduce(
                                          (sum, it) => sum + (it.amount || 0),
                                          0
                                        );
                                        const newCena = baseCena + newSum;
                                        updateProductRow(row.id, {
                                          surcharges: next,
                                          cena: newCena,
                                        });
                                      }}
                                    />
                                    <span className="text-[11px] text-zinc-500">Kč</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-[11px] text-zinc-500" colSpan={2}>
                              {row.surchargeWarnings?.length
                                ? row.surchargeWarnings.join(" ")
                                : null}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Total footer */}
            <div className="mt-4 flex justify-end text-sm font-semibold text-zinc-100">
              Celkem bez DPH: <span className="ml-2 font-bold">{totalProduktyBezDph} Kč</span>
            </div>
          </CollapsibleSection>

          {/* ── Poznámky ── */}
          <CollapsibleSection title="Poznámky">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Poznámky pro výrobu</label>
                <textarea
                  value={formData.poznamkyVyroba ?? ""}
                  onChange={(e) => updateField("poznamkyVyroba", e.target.value)}
                  rows={4}
                  className={inputCls}
                  placeholder="poznámky"
                />
              </div>
              <div>
                <label className={labelCls}>Poznámky pro montáž</label>
                <textarea
                  value={formData.poznamkyMontaz ?? ""}
                  onChange={(e) => updateField("poznamkyMontaz", e.target.value)}
                  rows={4}
                  className={inputCls}
                  placeholder="poznámky"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Platba a montáž ── */}
          <CollapsibleSection title="Platba a montáž">
            <div className="space-y-5">
              {/* General payment & delivery fields – 2-column grid for iPad */}
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className={labelCls}>K objednání</label>
                  <select
                    value={formData.kObjednani ?? "Celá zakázka"}
                    onChange={(e) => updateField("kObjednani", e.target.value)}
                    className={selectCls}
                  >
                    <option value="Celá zakázka">Celá zakázka</option>
                    <option value="Část zakázky">Část zakázky</option>
                  </select>
                </div>
                <div className="min-w-0">
                  <label className={labelCls}>Záloha zaplacena</label>
                  <select
                    value={formData.zalohaZaplacena ?? "Hotově"}
                    onChange={(e) => updateField("zalohaZaplacena", e.target.value)}
                    className={selectCls}
                  >
                    <option value="Hotově">Hotově</option>
                    <option value="Kartou">Kartou</option>
                    <option value="Převodem">Převodem</option>
                  </select>
                </div>
              </div>

              {/* ── Záloha & doplatek – visually distinct block ── */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
                <h3 className="mb-4 text-sm font-semibold text-zinc-100">Kalkulace zálohy a doplatku</h3>
                <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                  <p className="font-medium text-zinc-300">
                    Celkem bez DPH: <span className="text-zinc-50">{totalBezDph} Kč</span>
                  </p>
                  <p className="font-medium text-zinc-300">
                    Celkem s DPH ({vatRate}%): <span className="text-zinc-50">{totalSDph} Kč</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className={labelCls}>Záloha (s DPH)</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={0}
                          value={formData.zalohovaFaktura ?? ""}
                          onChange={(e) =>
                            updateField("zalohovaFaktura", parseInt(e.target.value, 10) || 0)
                          }
                          className={inputCls}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                          Kč
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateField("zalohovaFaktura", minZaloha)}
                        className="min-h-[44px] shrink-0 rounded-lg border border-primary bg-primary/20 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/30"
                      >
                        Nastavit na 50 %
                      </button>
                    </div>
                    {zalohaTooLow && totalSDph > 0 && (
                      <p className="mt-1.5 text-sm text-amber-400">
                        Záloha by měla být alespoň 50 % celkové ceny ({minZaloha} Kč).
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className={labelCls}>Doplatek</label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={doplatek}
                        className={`${inputCls} cursor-default bg-zinc-700/50`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                        Kč
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Delivery & assembly fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className={labelCls}>Dodací doba</label>
                  <input
                    type="date"
                    value={formData.predpokladanaDodaciDoba ?? ""}
                    onChange={(e) => updateField("predpokladanaDodaciDoba", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="min-w-0">
                  <label className={labelCls}>Doba montáže</label>
                  <input
                    type="text"
                    value={formData.predpokladanaDobaMontaze ?? ""}
                    onChange={(e) => updateField("predpokladanaDobaMontaze", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Date, signature, mediator */}
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className={labelCls}>Datum</label>
                  <input
                    type="date"
                    value={formData.datum ?? todayString()}
                    onChange={(e) => updateField("datum", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="min-w-0">
                  <label className={labelCls}>Zprostředkovatel</label>
                  <input
                    type="text"
                    value={formData.jmenoPodpisZprostredkovatele ?? ""}
                    onChange={(e) => updateField("jmenoPodpisZprostredkovatele", e.target.value)}
                    className={inputCls}
                    placeholder="Přihlášený uživatel"
                  />
                </div>
              </div>

              {/* E-podpis – button only */}
              <div>
                <label className={labelCls}>Podpis zákazníka</label>
                <button
                  type="button"
                  onClick={() => setShowSignModal(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  E-podpis zákazníka
                </button>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Error / success messages ── */}
          {submitError && (
            <p className="text-sm text-red-400">{submitError}</p>
          )}

          {/* ── Submit button (centered) ── */}
          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[48px] rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? "Ukládám…" : "Uložit formulář"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
