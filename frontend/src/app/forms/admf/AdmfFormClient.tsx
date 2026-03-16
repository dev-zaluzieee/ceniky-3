"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitForm, updateForm } from "@/lib/forms-api";
import { useAppMode } from "@/lib/mode-context";
import type { AdmfFormData, AdmfProductRow, AdmfVatRate } from "@/types/forms/admf.types";
import QrPaymentModal from "@/components/QrPaymentModal";
import { buildSpdString } from "@/lib/spd-qr";

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
    typProstoru: "bytovy" as const,
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

/** Extract digits from phone string for variabilní symbol prefill. Returns undefined if no digits. */
function phoneToVariabilniSymbol(phone?: string): number | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  // Strip leading Czech country code 420 if present
  const cleaned = digits.startsWith("420") && digits.length > 9 ? digits.slice(3) : digits;
  if (!cleaned) return undefined;
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function recalcCenaPoSleve(row: AdmfProductRow): number {
  return Math.round(row.cena * (1 - row.sleva / 100));
}

/** Clamp discount to allowed integer range (0-100). */
function sanitizeDiscountInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Compute doplatek exactly the same way as submit/save path so dirty-state comparison
 * uses a stable payload shape (including computed-only fields).
 */
function withComputedDoplatek(data: AdmfFormData): AdmfFormData {
  const totalBezDph =
    data.productRows.reduce((sum, row) => sum + (row.cenaPoSleve || 0) * (row.ks || 1), 0) +
    (data.montazCenaBezDph ?? 1339);
  const vatRate = (data.vatRate ?? 12) as AdmfVatRate;
  const totalSDph = Math.round(totalBezDph * (1 + vatRate / 100));
  const zaloha = data.zalohovaFaktura ?? 0;
  return {
    ...data,
    doplatek: Math.max(0, totalSDph - zaloha),
  };
}

/** Normalize ADMF data into a stable snapshot for dirty checks. */
function serializeForDirtyCheck(data: AdmfFormData): string {
  return JSON.stringify(withComputedDoplatek(data));
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
  "w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2.5 text-sm text-zinc-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const selectCls =
  "w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2.5 text-sm text-zinc-50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const labelCls = "mb-1.5 block text-sm font-medium text-zinc-200";
/** Dedicated class for iPad/Safari date width quirks. */
const dateInputCls = `${inputCls} admf-date-input`;

/* ── Main component ───────────────────────────────────────── */

export default function AdmfFormClient({
  initialData,
  formId,
  orderId,
  customerFromOrder,
}: AdmfFormClientProps) {
  const { mode } = useAppMode();
  const isEditMode = !!formId && !!initialData;
  const [formData, setFormData] = useState<AdmfFormData>(() => {
    if (initialData) {
      const customerFallback = customerFromOrder
        ? {
            jmenoPrijmeni: customerFromOrder.name ?? "",
            email: customerFromOrder.email ?? "",
            telefon: customerFromOrder.phone ?? "",
            ulice: customerFromOrder.address ?? "",
            mesto: customerFromOrder.city ?? "",
            psc: customerFromOrder.zipcode ?? "",
          }
        : {};
      const merged = {
        ...getDefaultFormData(),
        ...customerFallback,
        ...initialData,
        productRows: (initialData.productRows || []).map((r) => ({
          ...defaultProductRow(),
          ...r,
          id: r.id || defaultProductRow().id,
        })),
      };
      // Prefill variabilniSymbol from phone if not already set
      if (merged.variabilniSymbol == null) {
        merged.variabilniSymbol = phoneToVariabilniSymbol(merged.telefon);
      }
      return merged;
    }
    const d = getDefaultFormData();
    if (customerFromOrder) {
      d.jmenoPrijmeni = customerFromOrder.name ?? "";
      d.email = customerFromOrder.email ?? "";
      d.telefon = customerFromOrder.phone ?? "";
      d.ulice = customerFromOrder.address ?? "";
      d.mesto = customerFromOrder.city ?? "";
      d.psc = customerFromOrder.zipcode ?? "";
      d.variabilniSymbol = phoneToVariabilniSymbol(customerFromOrder.phone);
    }
    return d;
  });

  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  /** Blob URL for PDF viewer modal; when set, modal is open. Revoke on close. */
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [bulkSlevaInput, setBulkSlevaInput] = useState<string>("0");
  const [aresLoading, setAresLoading] = useState(false);
  const [aresError, setAresError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [exportTestMode, setExportTestMode] = useState(false);

  /** Dirty state tracking */
  const [isDirty, setIsDirty] = useState(false);
  const initialFormDataRef = useRef<string | null>(null);
  const latestFormDataRef = useRef<AdmfFormData | null>(null);
  useEffect(() => {
    if (formData && initialFormDataRef.current === null) {
      initialFormDataRef.current = serializeForDirtyCheck(formData);
    }
  }, [formData]);
  useEffect(() => {
    latestFormDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    if (!formData || initialFormDataRef.current === null) return;
    setIsDirty(serializeForDirtyCheck(formData) !== initialFormDataRef.current);
  }, [formData]);

  /** Autosave: debounced save 3s after last change (edit mode only) */
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveFailCountRef = useRef(0);
  const [autosaveError, setAutosaveError] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);

  useEffect(() => {
    // Only autosave in edit mode when dirty and not currently submitting/exporting
    if (!isEditMode || !formId || !isDirty || isSubmitting || exportLoading) return;

    // Cancel previous timer
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(async () => {
      // Re-check: data may have changed since timeout was set
      const latest = latestFormDataRef.current;
      if (!latest) return;
      const snapshot = serializeForDirtyCheck(latest);
      if (snapshot === initialFormDataRef.current) return;

      setIsAutosaving(true);
      const dataToSave = withComputedDoplatek(latest);
      try {
        const res = await updateForm(formId, dataToSave);
        if (res.success) {
          autosaveFailCountRef.current = 0;
          setAutosaveError(false);
          setSubmitSuccess(true);
          const savedSnapshot = serializeForDirtyCheck(dataToSave);
          initialFormDataRef.current = savedSnapshot;
          const currentData = latestFormDataRef.current;
          setIsDirty(
            currentData ? serializeForDirtyCheck(currentData) !== savedSnapshot : false
          );
        } else {
          autosaveFailCountRef.current++;
          if (autosaveFailCountRef.current >= 3) setAutosaveError(true);
        }
      } catch {
        autosaveFailCountRef.current++;
        if (autosaveFailCountRef.current >= 3) setAutosaveError(true);
      } finally {
        setIsAutosaving(false);
      }
    }, 3000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [formData, isEditMode, formId, isDirty, isSubmitting, exportLoading]);

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

  /** Apply one integer discount value to every product row. */
  const applyDiscountToAllRows = useCallback((discount: number) => {
    const sanitizedDiscount = sanitizeDiscountInteger(discount);
    setFormData((prev) => ({
      ...prev,
      productRows: prev.productRows.map((row) => {
        const next = { ...row, sleva: sanitizedDiscount };
        next.cenaPoSleve = recalcCenaPoSleve(next);
        return next;
      }),
    }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Cancel any pending autosave to avoid double-save
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveFailCountRef.current = 0;
    setAutosaveError(false);
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    const dataToSave: AdmfFormData = withComputedDoplatek(formData);
    try {
      if (isEditMode && formId) {
        const res = await updateForm(formId, dataToSave);
        if (!res.success) {
          setSubmitError(res.error ?? "Uložení se nepodařilo.");
          return;
        }
        setSubmitSuccess(true);
        const savedSnapshot = serializeForDirtyCheck(dataToSave);
        initialFormDataRef.current = savedSnapshot;
        const latestFormData = latestFormDataRef.current;
        setIsDirty(
          latestFormData ? serializeForDirtyCheck(latestFormData) !== savedSnapshot : false
        );
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

  const bankAccount = process.env.NEXT_PUBLIC_BANK_ACCOUNT ?? "";
  const qrSpdString =
    bankAccount && zalohovaFaktura > 0 && formData.variabilniSymbol
      ? buildSpdString({
          account: bankAccount,
          amount: zalohovaFaktura,
          variableSymbol: formData.variabilniSymbol,
          message: "Zaloha za objednavku",
        })
      : "";

  // Column labels from price-affecting fields
  const firstRowWithPriceFields = formData.productRows.find(
    (r) => (r.priceAffectingFields?.length ?? 0) > 0
  );
  const priceField1Label =
    firstRowWithPriceFields?.priceAffectingFields?.[0]?.label ?? "Rám";
  const priceField2Label =
    firstRowWithPriceFields?.priceAffectingFields?.[1]?.label ?? "Lamela/Látka";

  /** Look up company data by IČO via ARES and auto-fill fields. */
  const handleAresLookup = async () => {
    const ico = (formData.ico ?? "").trim();
    if (!ico) return;
    setAresLoading(true);
    setAresError(null);
    try {
      const res = await fetch(`/api/ares/${encodeURIComponent(ico)}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAresError(json.error || "Nepodařilo se vyhledat IČO.");
        return;
      }
      const d = json.data as { ico: string; dic?: string; obchodniJmeno: string; ulice: string; mesto: string; psc: string };
      setFormData((prev) => ({
        ...prev,
        ico: d.ico,
        dic: d.dic ?? prev.dic,
        nazevFirmy: d.obchodniJmeno,
        ulice: d.ulice || prev.ulice,
        mesto: d.mesto || prev.mesto,
        psc: d.psc || prev.psc,
      }));
    } catch {
      setAresError("Nepodařilo se spojit se serverem.");
    } finally {
      setAresLoading(false);
    }
  };

  /** Use device GPS to get current location and reverse-geocode into delivery address. */
  const handleGeolocation = async () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolokace není v tomto prohlížeči podporována.");
      return;
    }
    setGeoLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
        });
      });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `/api/geocode/reverse?lat=${latitude}&lon=${longitude}`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setGeoError(json.error || "Nepodařilo se získat adresu.");
        return;
      }
      const d = json.data as { ulice: string; mesto: string; psc: string };
      setFormData((prev) => ({
        ...prev,
        dodaciUlice: d.ulice || prev.dodaciUlice,
        dodaciMesto: d.mesto || prev.dodaciMesto,
        dodaciPsc: d.psc || prev.dodaciPsc,
      }));
    } catch (err: unknown) {
      if (err instanceof GeolocationPositionError) {
        const msgs: Record<number, string> = {
          1: "Přístup k poloze byl zamítnut. Povolte polohu v nastavení.",
          2: "Polohu se nepodařilo zjistit.",
          3: "Zjištění polohy trvalo příliš dlouho.",
        };
        setGeoError(msgs[err.code] || "Nepodařilo se zjistit polohu.");
      } else {
        setGeoError("Nepodařilo se získat adresu z polohy.");
      }
    } finally {
      setGeoLoading(false);
    }
  };

  // ── Raynet export: load status on mount ──
  useEffect(() => {
    if (!formId || !isEditMode) return;
    fetch(`/api/forms/${formId}/export-status`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setExportedAt(json.data.exportedAt);
          setExportTestMode(json.data.testMode ?? false);
        }
      })
      .catch(() => {});
  }, [formId, isEditMode]);

  /** Run the Raynet export (or test export). */
  const handleExportToRaynet = async () => {
    if (!formId || !isEditMode) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await fetch(`/api/forms/${formId}/export-raynet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ testMode: mode === "TEST" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setExportError(json.error || "Export se nezdařil.");
        return;
      }
      setExportedAt(json.data.exportedAt);
      setExportTestMode(json.data.testMode ?? false);
      setShowSendModal(false);

      // TODO: trigger email sending to customer here
      // if (mode === "PRODUCTION") { await sendEmailToCustomer(formId); }
    } catch {
      setExportError("Nepodařilo se spojit se serverem.");
    } finally {
      setExportLoading(false);
    }
  };

  /**
   * Fetch PDF and open it in a modal; user can view and download from there.
   * Blocks when form has unsaved changes because backend renders from stored form_json.
   */
  const handleOpenPdfModal = async () => {
    setPdfError(null);
    if (!formId || !isEditMode) {
      setPdfError("Nejdříve formulář uložte. PDF lze zobrazit až po uložení.");
      return;
    }
    if (isDirty) {
      setPdfError("Máte neuložené změny. Nejdříve formulář uložte.");
      return;
    }

    setPdfLoading(true);
    try {
      const pdfUrl = `/api/forms/${formId}/pdf`;
      const res = await fetch(pdfUrl, { credentials: "include" });
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfViewerUrl(url);
    } catch {
      setPdfError("Nepodařilo se načíst PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  /** Close PDF modal and revoke blob URL to free memory. */
  const handleClosePdfModal = useCallback(() => {
    if (pdfViewerUrl) URL.revokeObjectURL(pdfViewerUrl);
    setPdfViewerUrl(null);
  }, [pdfViewerUrl]);

  /** Close PDF modal on Escape key */
  useEffect(() => {
    if (!pdfViewerUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClosePdfModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pdfViewerUrl, handleClosePdfModal]);

  /** Save the currently shown PDF via native share sheet (iPad) or download fallback. */
  const handleDownloadPdfFromModal = async () => {
    if (!pdfViewerUrl || !formId) return;
    const fileName = `admf-${formId}.pdf`;
    try {
      const res = await fetch(pdfViewerUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch {
      // share cancelled or unsupported – fall through to <a> fallback
    }
    const a = document.createElement("a");
    a.href = pdfViewerUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
        <div className="mb-3 flex flex-wrap items-center gap-3">
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
          ) : isAutosaving ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-500 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Ukládám…
            </span>
          ) : isDirty ? (
            <span className="rounded-md border border-amber-400 bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-400">
              neuložené změny
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={isSubmitting}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {isSubmitting ? "Ukládám…" : "Uložit"}
            </button>
            <button
              type="button"
              onClick={handleOpenPdfModal}
              disabled={pdfLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              {pdfLoading ? "Načítám PDF…" : "Zobrazit PDF"}
            </button>
            {pdfError && (
              <p className="text-sm text-red-400">{pdfError}</p>
            )}
            <button
              type="button"
              onClick={() => {
                if (isDirty) {
                  setExportError("Máte neuložené změny. Nejdříve formulář uložte.");
                  return;
                }
                setExportError(null);
                setShowSendModal(true);
              }}
              disabled={!isEditMode || exportLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {exportLoading ? "Exportuji…" : "Odeslat zákazníkovi"}
            </button>
            {exportError && (
              <p className="text-sm text-red-400">{exportError}</p>
            )}
          </div>
        </div>

        {/* ── Status bar: export info + autosave warning ── */}
        {(exportedAt || autosaveError) && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5">
            {exportedAt && (
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                <svg className="h-3.5 w-3.5 shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Exportováno do Raynet{exportTestMode ? " (test)" : ""}: {new Date(exportedAt).toLocaleString("cs-CZ")}
              </span>
            )}
            {autosaveError && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Automatické ukládání selhalo — uložte ručně
              </span>
            )}
          </div>
        )}

        {/* Modal: Odeslat zákazníkovi — confirms Raynet export + email */}
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
              {mode === "PRODUCTION" ? (
                <p className="mb-6 text-sm text-zinc-300">
                  Tato akce synchronizuje data formuláře do Raynetu a odešle e-mail zákazníkovi.
                  Chcete pokračovat?
                </p>
              ) : (
                <p className="mb-6 text-sm text-zinc-300">
                  <span className="font-semibold text-amber-400">Testovací režim</span> — vše
                  proběhne stejně jako v produkci, ale data se neodešlou do Raynetu a zákazníkovi
                  nepřijde e-mail. Vhodné pro testování.
                </p>
              )}
              {exportError && (
                <p className="mb-4 text-sm text-red-400">{exportError}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  disabled={exportLoading}
                  className="min-h-[44px] rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500 disabled:opacity-50"
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={handleExportToRaynet}
                  disabled={exportLoading}
                  className={`min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 ${
                    mode === "PRODUCTION"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {exportLoading ? "Odesílám…" : mode === "PRODUCTION" ? "Odeslat" : "Odeslat (test)"}
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

        {/* Modal: PDF viewer with download */}
        {pdfViewerUrl && (
          <div
            className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-modal-title"
            onClick={(e) => { if (e.target === e.currentTarget) handleClosePdfModal(); }}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-700 pb-3">
              <h2 id="pdf-modal-title" className="text-lg font-semibold text-zinc-50">
                Náhled PDF
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdfFromModal}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Stáhnout
                </button>
                <button
                  type="button"
                  onClick={handleClosePdfModal}
                  className="min-h-[44px] rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500"
                >
                  Zavřít
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 pt-3">
              <iframe
                src={pdfViewerUrl}
                title="Náhled administrativního formuláře"
                className="h-full w-full rounded border border-zinc-700 bg-white"
              />
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
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

          {/* ── Údaje zákazníka / fakturační údaje ── */}
          <CollapsibleSection title="Údaje zákazníka">
            <div className="space-y-4">
              {/* Read-only display when override is off */}
              {!formData.fakturaOverride && (
                <div className="space-y-2 text-sm text-zinc-300">
                  {formData.jmenoPrijmeni && <p><span className="text-zinc-500">Jméno:</span> {formData.jmenoPrijmeni}</p>}
                  {formData.email && <p><span className="text-zinc-500">E-mail:</span> {formData.email}</p>}
                  {formData.telefon && <p><span className="text-zinc-500">Telefon:</span> {formData.telefon}</p>}
                  {formData.ulice && <p><span className="text-zinc-500">Adresa:</span> {formData.ulice}</p>}
                  {formData.mesto && <p><span className="text-zinc-500">Město:</span> {formData.mesto}</p>}
                  {formData.psc && <p><span className="text-zinc-500">PSČ:</span> {formData.psc}</p>}
                  {!formData.jmenoPrijmeni && !formData.email && !formData.telefon && (
                    <p className="text-zinc-500">Žádné údaje zákazníka.</p>
                  )}
                </div>
              )}

              {/* Override checkbox */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.fakturaOverride ?? false}
                  onChange={(e) => updateField("fakturaOverride", e.target.checked)}
                  className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-zinc-200">Změnit údaje na faktuře</span>
              </label>

              {/* Editable fields when override is active */}
              {formData.fakturaOverride && (
                <div className="space-y-4">
                  {/* Person type toggle */}
                  <div className="flex gap-1 rounded-lg bg-zinc-700 p-1 max-w-xs">
                    <button
                      type="button"
                      onClick={() => updateField("typOsoby", "soukroma")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        (formData.typOsoby ?? "soukroma") === "soukroma"
                          ? "bg-primary text-white"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      Soukromá osoba
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField("typOsoby", "pravnicka")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        formData.typOsoby === "pravnicka"
                          ? "bg-primary text-white"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      Právnická osoba
                    </button>
                  </div>

                  {/* Právnická osoba: IČO search + extra fields */}
                  {formData.typOsoby === "pravnicka" && (
                    <>
                      <div>
                        <label className={labelCls}>IČO</label>
                        <div className="flex gap-2 max-w-md">
                          <input
                            type="text"
                            value={formData.ico ?? ""}
                            onChange={(e) => updateField("ico", e.target.value)}
                            className={`${inputCls} flex-1`}
                            placeholder="Např. 07664681"
                          />
                          <button
                            type="button"
                            onClick={handleAresLookup}
                            disabled={aresLoading || !(formData.ico ?? "").trim()}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500 disabled:opacity-50"
                          >
                            {aresLoading ? "Hledám…" : "Vyhledat"}
                          </button>
                        </div>
                        {aresError && <p className="mt-1 text-sm text-red-400">{aresError}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>Název firmy</label>
                          <input
                            type="text"
                            value={formData.nazevFirmy ?? ""}
                            onChange={(e) => updateField("nazevFirmy", e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls}>DIČ</label>
                          <input
                            type="text"
                            value={formData.dic ?? ""}
                            onChange={(e) => updateField("dic", e.target.value)}
                            className={inputCls}
                            placeholder="CZ..."
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Common fields */}
                  <div>
                    <label className={labelCls}>Jméno {formData.typOsoby === "pravnicka" ? "kontaktní osoby" : "zákazníka"}</label>
                    <input
                      type="text"
                      value={formData.jmenoPrijmeni ?? ""}
                      onChange={(e) => updateField("jmenoPrijmeni", e.target.value)}
                      className={`${inputCls} max-w-md`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
              )}
            </div>
          </CollapsibleSection>

          {/* ── Adresa dodání ── */}
          <CollapsibleSection title="Adresa dodání">
            <div className="space-y-4">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.jinaAdresaDodani ?? false}
                  onChange={(e) => updateField("jinaAdresaDodani", e.target.checked)}
                  className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-zinc-200">Jiná adresa dodání</span>
              </label>

              {formData.jinaAdresaDodani && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={handleGeolocation}
                    disabled={geoLoading}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500 disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {geoLoading ? "Zjišťuji polohu…" : "Použít aktuální polohu"}
                  </button>
                  {geoError && <p className="text-sm text-red-400">{geoError}</p>}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Adresa</label>
                      <input
                        type="text"
                        value={formData.dodaciUlice ?? ""}
                        onChange={(e) => updateField("dodaciUlice", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Město</label>
                      <input
                        type="text"
                        value={formData.dodaciMesto ?? ""}
                        onChange={(e) => updateField("dodaciMesto", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>PSČ</label>
                      <input
                        type="text"
                        value={formData.dodaciPsc ?? ""}
                        onChange={(e) => updateField("dodaciPsc", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                </div>
              )}
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
                    <option value="RD">RD</option>
                    <option value="Byt">Byt</option>
                    <option value="Nebytový protor">Nebytový prostor</option>
                    <option value="chata">Chata</option>
                    <option value="vila">Vila</option>
                    <option value="Obytná maringotka">Obytná maringotka</option>
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
                  <label className={labelCls}>Typ prostoru</label>
                  <div className="flex gap-1 rounded-lg bg-zinc-700 p-1">
                    <button
                      type="button"
                      onClick={() => updateField("typProstoru", "bytovy")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        (formData.typProstoru ?? "bytovy") === "bytovy"
                          ? "bg-primary text-white"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      Bytový
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField("typProstoru", "nebytovy")}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        formData.typProstoru === "nebytovy"
                          ? "bg-primary text-white"
                          : "text-zinc-300 hover:text-white"
                      }`}
                    >
                      Nebytový
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Má zákazník vyfocenou lamelu?</label>
                <ToggleButton
                  value={formData.maZakaznikVyfocenouLamelu ?? true}
                  onChange={(v) => updateField("maZakaznikVyfocenouLamelu", v)}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Jméno na zvonku</label>
                  <input
                    type="text"
                    value={formData.zvonek ?? ""}
                    onChange={(e) => updateField("zvonek", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Patro</label>
                  <input
                    type="text"
                    value={formData.patro ?? ""}
                    onChange={(e) => updateField("patro", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Info k parkování</label>
                  <input
                    type="text"
                    value={formData.infoKParkovani ?? ""}
                    onChange={(e) => updateField("infoKParkovani", e.target.value)}
                    className={inputCls}
                    placeholder={formData.parkovani ? "OK" : ""}
                  />
                </div>
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
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="w-full max-w-[240px]">
                <label className={labelCls}>Sleva pro všechny produkty (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={bulkSlevaInput}
                  onChange={(e) => {
                    const nextRaw = e.target.value;
                    if (nextRaw === "") {
                      setBulkSlevaInput("");
                      return;
                    }
                    const parsed = parseInt(nextRaw, 10);
                    setBulkSlevaInput(
                      Number.isNaN(parsed) ? "0" : String(sanitizeDiscountInteger(parsed))
                    );
                  }}
                  onBlur={() => {
                    const parsed = parseInt(bulkSlevaInput, 10);
                    setBulkSlevaInput(String(sanitizeDiscountInteger(parsed)));
                  }}
                  className={`${inputCls} text-right`}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const parsed = parseInt(bulkSlevaInput, 10);
                  const discount = sanitizeDiscountInteger(parsed);
                  setBulkSlevaInput(String(discount));
                  applyDiscountToAllRows(discount);
                }}
                disabled={formData.productRows.length === 0}
                className="min-h-[44px] rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nastavit slevu všem
              </button>
            </div>
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
                    const field1Value = row.priceAffectingFields?.[0]?.value ?? "";
                    const field2Value = row.priceAffectingFields?.[1]?.value ?? "";
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
                            <span className="text-sm text-zinc-100">{field1Value}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-sm text-zinc-100">{field2Value}</span>
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
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={row.sleva || 0}
                              onChange={(e) =>
                                updateProductRow(row.id, {
                                  sleva: sanitizeDiscountInteger(parseInt(e.target.value, 10)),
                                })
                              }
                              className={`${inputCls} w-20 text-right`}
                            />
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

          {/* ── Slevy ── */}
          <CollapsibleSection title="Slevy">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>OVT sleva (Kč)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={formData.ovtSlevaCastka ?? ""}
                      onChange={(e) =>
                        updateField("ovtSlevaCastka", parseInt(e.target.value, 10) || 0)
                      }
                      className={inputCls}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                      Kč
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.mngSleva ?? false}
                    onChange={(e) => updateField("mngSleva", e.target.checked)}
                    className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-zinc-200">MNG sleva (manažerská)</span>
                </label>
              </div>
              {formData.mngSleva && (
                <div className="max-w-xs">
                  <label className={labelCls}>MNG sleva částka (Kč)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={formData.mngSlevaCastka ?? ""}
                      onChange={(e) =>
                        updateField("mngSlevaCastka", parseInt(e.target.value, 10) || 0)
                      }
                      className={inputCls}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                      Kč
                    </span>
                  </div>
                </div>
              )}
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
                <div>
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
                <div>
                  <label className={labelCls}>Záloha zaplacena</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={formData.zalohaZaplacena ?? "Hotově"}
                      onChange={(e) => updateField("zalohaZaplacena", e.target.value)}
                      className={selectCls}
                    >
                      <option value="Hotově">Hotově</option>
                      <option value="Terminálem">Terminálem</option>
                      <option value="QR">QR</option>
                      <option value="Fakturou">Fakturou</option>
                      <option value="převodem">Převodem</option>
                    </select>
                    {formData.zalohaZaplacena === "QR" && (
                      <button
                        type="button"
                        disabled={!formData.zalohovaFaktura || !formData.variabilniSymbol}
                        onClick={() => setShowQrModal(true)}
                        className="min-h-[44px] shrink-0 rounded-lg border border-primary bg-primary/20 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          !formData.zalohovaFaktura
                            ? "Vyplňte zálohovou fakturu"
                            : !formData.variabilniSymbol
                              ? "Vyplňte variabilní symbol"
                              : "Zobrazit QR kód pro platbu"
                        }
                      >
                        QR platba
                      </button>
                    )}
                  </div>
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
                  <div>
                    <label className={labelCls}>Zálohová faktura (s DPH)</label>
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
                  <div>
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

              {/* Variabilní symbol, info fields */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelCls}>Variabilní symbol</label>
                  <input
                    type="number"
                    value={formData.variabilniSymbol ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === "") {
                        updateField("variabilniSymbol", undefined);
                        return;
                      }
                      const num = parseInt(raw, 10);
                      updateField(
                        "variabilniSymbol",
                        Number.isFinite(num) && num > 0 ? num : undefined
                      );
                    }}
                    className={inputCls}
                    placeholder="Telefonní číslo zákazníka"
                  />
                </div>
                <div>
                  <label className={labelCls}>Info k záloze</label>
                  <input
                    type="text"
                    value={formData.infoKZaloze ?? ""}
                    onChange={(e) => updateField("infoKZaloze", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Info k faktuře</label>
                  <input
                    type="text"
                    value={formData.infoKFakture ?? ""}
                    onChange={(e) => updateField("infoKFakture", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Delivery & assembly fields */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0">
                  <label className={labelCls}>Předpokládaná dodací doba</label>
                  <input
                    type="date"
                    value={formData.predpokladanaDodaciDoba ?? ""}
                    onChange={(e) => updateField("predpokladanaDodaciDoba", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Předpokládaná doba montáže</label>
                  <input
                    type="text"
                    value={formData.predpokladanaDobaMontaze ?? ""}
                    onChange={(e) => updateField("predpokladanaDobaMontaze", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Date, signature, mediator */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0">
                  <label className={labelCls}>Datum</label>
                  <input
                    type="date"
                    value={formData.datum ?? todayString()}
                    onChange={(e) => updateField("datum", e.target.value)}
                    className={dateInputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Jméno zprostředkovatele</label>
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

        {/* QR payment modal */}
        {bankAccount && formData.variabilniSymbol && zalohovaFaktura > 0 && (
          <QrPaymentModal
            open={showQrModal}
            onClose={() => setShowQrModal(false)}
            spdString={qrSpdString}
            account={bankAccount}
            amount={zalohovaFaktura}
            variableSymbol={formData.variabilniSymbol}
            message="Záloha za objednávku"
          />
        )}
      </div>
    </div>
  );
}