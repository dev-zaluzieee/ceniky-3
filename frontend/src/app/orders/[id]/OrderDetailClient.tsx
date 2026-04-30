"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import type { OrderRecord } from "@/lib/orders-api";
import { updateOrder } from "@/lib/orders-api";
import type { FormRecord, FormType, PaginationInfo } from "@/lib/forms-api";
import { getFormById, submitForm } from "@/lib/forms-api";
import { parseForm } from "@/parsers/forms";
import {
  listPricingForms,
  type PricingFormListItem,
} from "@/lib/pricing-forms-api";
import { useAppMode } from "@/lib/mode-context";
import {
  getRetentionStatus,
  sendOrderToRetention,
  type RetentionStatus,
} from "@/lib/retention-api";

const FORM_TYPE_NAMES: Record<FormType, string> = {
  custom: "Vlastní formulář",
  admf: "Administrativní formulář (ADMF)",
};

const STEP1_FORM_TYPES: FormType[] = ["custom"];

function getFormEditUrl(orderId: number, formId: number): string {
  return `/orders/${orderId}/forms/${formId}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("cs-CZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("cs-CZ", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

/** Chevron icon for collapsible sections */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-5 w-5 transition-transform ${open ? "rotate-0" : "rotate-180"}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

/** Collapsible card wrapper */
function CollapsibleCard({
  title,
  open,
  onToggle,
  headerRight,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          {headerRight && (
            <div onClick={(e) => e.stopPropagation()}>{headerRight}</div>
          )}
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="border-t border-zinc-200 p-5 dark:border-zinc-700">{children}</div>}
    </div>
  );
}

interface OrderDetailClientProps {
  order: OrderRecord;
  forms: FormRecord[];
  formsPagination: PaginationInfo | null;
}

export default function OrderDetailClient({
  order: initialOrder,
  forms: initialForms,
  formsPagination,
}: OrderDetailClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [forms, setForms] = useState(initialForms);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [hoveredAdmfFormId, setHoveredAdmfFormId] = useState<number | null>(null);
  const [selectedFormIdsForAdmf, setSelectedFormIdsForAdmf] = useState<Set<number>>(new Set());

  // Collapsible sections
  const [basicInfoOpen, setBasicInfoOpen] = useState(true);
  const [formsOpen, setFormsOpen] = useState(true);
  const [admfOpen, setAdmfOpen] = useState(true);

  // Add form modal
  const [showAddFormModal, setShowAddFormModal] = useState(false);
  const [pricingForms, setPricingForms] = useState<PricingFormListItem[] | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [modalSearch, setModalSearch] = useState("");

  // Customer data
  const [customerData, setCustomerData] = useState({
    name: initialOrder.name ?? "",
    email: initialOrder.email ?? "",
    phone: initialOrder.phone ?? "",
    address: initialOrder.address ?? "",
    city: initialOrder.city ?? "",
    zipcode: initialOrder.zipcode ?? "",
    raynet_id: initialOrder.raynet_id != null ? String(initialOrder.raynet_id) : "",
    erp_customer_id: initialOrder.erp_customer_id != null ? String(initialOrder.erp_customer_id) : "",
    source_erp_order_id: initialOrder.source_erp_order_id != null ? String(initialOrder.source_erp_order_id) : "",
    notes: initialOrder.notes ?? "",
  });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerSaveError, setCustomerSaveError] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const notesEditorRef = useRef<HTMLDivElement>(null);
  const [notesOverflows, setNotesOverflows] = useState(false);

  // Export status per ADMF form: formId → { exportedAt, testMode }
  const [exportStatuses, setExportStatuses] = useState<Record<number, { exportedAt: string; testMode: boolean }>>({});

  // Retention pipeline state
  const { mode } = useAppMode();
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatus | null>(null);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [retentionReason, setRetentionReason] = useState("");
  const [retentionSubmitting, setRetentionSubmitting] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  /** Set after the user acknowledges "tato zakázka už byla odeslána" so the textarea can render. */
  const [retentionResendAcknowledged, setRetentionResendAcknowledged] = useState(false);

  useEffect(() => {
    setOrder(initialOrder);
    setCustomerData({
      name: initialOrder.name ?? "",
      email: initialOrder.email ?? "",
      phone: initialOrder.phone ?? "",
      address: initialOrder.address ?? "",
      city: initialOrder.city ?? "",
      zipcode: initialOrder.zipcode ?? "",
      raynet_id: initialOrder.raynet_id != null ? String(initialOrder.raynet_id) : "",
      erp_customer_id: initialOrder.erp_customer_id != null ? String(initialOrder.erp_customer_id) : "",
      source_erp_order_id: initialOrder.source_erp_order_id != null ? String(initialOrder.source_erp_order_id) : "",
      notes: initialOrder.notes ?? "",
    });
  }, [initialOrder]);

  // Load pricing forms when modal opens
  useEffect(() => {
    if (!showAddFormModal || pricingForms !== null) return;
    let cancelled = false;
    (async () => {
      setPricingLoading(true);
      setPricingError(null);
      const res = await listPricingForms({});
      if (cancelled) return;
      setPricingLoading(false);
      if (res.success && res.data) setPricingForms(res.data);
      else setPricingError(res.error ?? "Nepodařilo se načíst formuláře.");
    })();
    return () => { cancelled = true; };
  }, [showAddFormModal, pricingForms]);

  /**
   * Reset modal-local search state whenever the add-form modal closes.
   * This keeps each modal open as a fresh view with the full forms list visible.
   */
  useEffect(() => {
    if (!showAddFormModal) {
      setModalSearch("");
    }
  }, [showAddFormModal]);

  // Fetch export status for each ADMF form
  useEffect(() => {
    const admf = forms.filter((f) => f.form_type === "admf");
    if (admf.length === 0) return;
    let cancelled = false;
    Promise.all(
      admf.map((f) =>
        fetch(`/api/forms/${f.id}/export-status`, { credentials: "include" })
          .then((r) => r.json())
          .then((json) => ({ formId: f.id, data: json.success && json.data ? json.data : null }))
          .catch(() => ({ formId: f.id, data: null }))
      )
    ).then((results) => {
      if (cancelled) return;
      const statuses: Record<number, { exportedAt: string; testMode: boolean }> = {};
      for (const r of results) {
        if (r.data) {
          statuses[r.formId] = { exportedAt: r.data.exportedAt, testMode: r.data.testMode ?? false };
        }
      }
      setExportStatuses(statuses);
    });
    return () => { cancelled = true; };
  }, [forms]);

  // Fetch retention status for the order header badge + modal "already sent" gate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getRetentionStatus(order.id);
      if (cancelled) return;
      if (res.success && res.data) setRetentionStatus(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  /** Reset modal-local state whenever the retention modal closes. */
  useEffect(() => {
    if (showRetentionModal) return;
    setRetentionReason("");
    setRetentionError(null);
    setRetentionResendAcknowledged(false);
  }, [showRetentionModal]);

  /** Close retention modal on Escape */
  useEffect(() => {
    if (!showRetentionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !retentionSubmitting) setShowRetentionModal(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showRetentionModal, retentionSubmitting]);

  const handleSubmitRetention = async () => {
    const reason = retentionReason.trim();
    if (reason.length === 0) {
      setRetentionError("Zadejte prosím důvod.");
      return;
    }
    setRetentionSubmitting(true);
    setRetentionError(null);
    const res = await sendOrderToRetention({
      orderId: order.id,
      reason,
      testMode: mode === "TEST",
    });
    setRetentionSubmitting(false);
    if (!res.success) {
      setRetentionError(res.error ?? "Odeslání selhalo.");
      return;
    }
    /** Refresh status so the header badge + future modal opens reflect the new SUCCESS row. */
    const statusRes = await getRetentionStatus(order.id);
    if (statusRes.success && statusRes.data) setRetentionStatus(statusRes.data);
    setShowRetentionModal(false);
  };

  /** Detect whether the notes preview overflows so we can show the "Zobrazit celé" button. */
  useEffect(() => {
    const el = notesRef.current;
    if (!el) { setNotesOverflows(false); return; }
    setNotesOverflows(el.scrollHeight > el.clientHeight);
  }, [customerData.notes]);

  /** Close notes modal on Escape */
  useEffect(() => {
    if (!showNotesModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowNotesModal(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showNotesModal]);

  const handleOpenNotesModal = () => {
    setNotesSaveError(null);
    setShowNotesModal(true);
  };

  const handleSaveNotesToRaynet = async () => {
    if (!order.source_raynet_event_id) return;
    const html = notesEditorRef.current?.innerHTML ?? "";
    setIsSavingNotes(true);
    setNotesSaveError(null);
    try {
      const res = await fetch(`/api/raynet/events/${order.source_raynet_event_id}/description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: html }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotesSaveError(data.error || "Nepodařilo se uložit do Raynetu.");
        return;
      }
      // Also update local order notes
      const orderRes = await updateOrder(order.id, { notes: html || null });
      if (orderRes.success && orderRes.data) {
        setOrder(orderRes.data);
        setCustomerData((prev) => ({ ...prev, notes: html }));
      }
      setShowNotesModal(false);
    } catch {
      setNotesSaveError("Došlo k chybě při ukládání.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveCustomer = async () => {
    setIsSavingCustomer(true);
    setCustomerSaveError(null);
    try {
      const res = await updateOrder(order.id, {
        name: customerData.name || undefined,
        email: customerData.email || undefined,
        phone: customerData.phone || undefined,
        address: customerData.address || undefined,
        city: customerData.city || undefined,
        zipcode: customerData.zipcode || undefined,
        raynet_id: customerData.raynet_id.trim() === "" ? null : Number(customerData.raynet_id),
        erp_customer_id: customerData.erp_customer_id.trim() === "" ? null : Number(customerData.erp_customer_id),
        source_erp_order_id: customerData.source_erp_order_id.trim() === "" ? null : Number(customerData.source_erp_order_id),
      });
      if (!res.success) {
        setCustomerSaveError(res.error || "Nepodařilo se uložit.");
        return;
      }
      if (res.data) setOrder(res.data);
    } catch (e: any) {
      setCustomerSaveError(e?.message || "Chyba při ukládání.");
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleDeleteForm = async (formId: number) => {
    if (deletingId !== null) return;
    setDeletingId(formId);
    try {
      const res = await fetch(`/api/forms/${formId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        console.error("Delete form failed:", data);
        setDeletingId(null);
        return;
      }
      setForms((prev) => prev.filter((f) => f.id !== formId));
    } catch (e) {
      console.error("Delete form error:", e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicateForm = async (formId: number) => {
    if (duplicatingId !== null) return;
    setDuplicatingId(formId);
    setDuplicateError(null);
    try {
      const form = await getFormById(formId);
      if (!form) {
        setDuplicateError("Formulář se nepodařilo načíst.");
        return;
      }
      const res = await submitForm(form.form_type, form.form_json, order.id);
      if (!res.success || !res.data) {
        setDuplicateError(res.error ?? "Duplikace se nepodařila.");
        return;
      }
      const newRecord: FormRecord = {
        id: res.data.id,
        user_id: res.data.user_id,
        form_type: res.data.form_type,
        form_json: res.data.form_json,
        order_id: order.id,
        created_at: res.data.created_at,
        updated_at: res.data.updated_at,
        deleted_at: null,
      };
      setForms((prev) => [...prev, newRecord]);
    } catch (e: any) {
      setDuplicateError(e?.message ?? "Chyba při duplikaci.");
    } finally {
      setDuplicatingId(null);
    }
  };

  const goToCustomFormWithPricing = (pricingId: string) => {
    setShowAddFormModal(false);
    router.push(`/orders/${order.id}/forms/create/custom?pricingId=${encodeURIComponent(pricingId)}`);
  };

  const step1Forms = forms.filter((f) => STEP1_FORM_TYPES.includes(f.form_type as FormType));
  const admfForms = forms.filter((f) => f.form_type === "admf");

  // Find the most recently exported ADMF form
  const latestExportedFormId = Object.keys(exportStatuses).length > 0
    ? Object.entries(exportStatuses).reduce<number | null>((best, [formId, status]) => {
        if (!best) return Number(formId);
        const bestDate = exportStatuses[best]?.exportedAt ?? "";
        return status.exportedAt > bestDate ? Number(formId) : best;
      }, null)
    : null;
  const sourceFormIdsToHighlight =
    hoveredAdmfFormId != null
      ? (forms.find((f) => f.id === hoveredAdmfFormId)?.form_json as { source_form_ids?: number[] } | undefined)
          ?.source_form_ids ?? []
      : [];

  const pageTitle = `${formatShortDate(order.created_at)} - Zakázka ${order.name || `#${order.id}`}`;

  // Shared input classes optimized for iPad touch targets
  const inputClasses =
    "w-full rounded-md border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50";
  const labelClasses = "mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400";

  return (
    <div className="min-h-screen bg-zinc-50 py-6 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-5xl">
        {/* Back link */}
        <Link
          href="/orders"
          className="mb-3 inline-flex items-center gap-2 py-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Zpět na moje zakázky
        </Link>

        {/* Page title with date + customer name; retention button on the right */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {pageTitle}
          </h1>
          <button
            type="button"
            onClick={() => setShowRetentionModal(true)}
            className={
              retentionStatus?.inRetention
                ? "inline-flex items-center gap-2 rounded-md border border-red-700 bg-red-100 px-4 py-2 text-sm font-medium text-red-900 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200"
                : retentionStatus?.inRetentionRequested
                  ? "inline-flex items-center gap-2 rounded-md border border-amber-600 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-200"
                  : "inline-flex items-center gap-2 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            }
            title={
              retentionStatus?.inRetention
                ? "Zakázka je v retencích"
                : retentionStatus?.inRetentionRequested
                  ? "Žádost o retenci byla odeslána, kancelář ji ještě nezpracovala"
                  : "Odeslat zakázku na retence"
            }
          >
            {retentionStatus?.inRetention
              ? "V retencích"
              : retentionStatus?.inRetentionRequested
                ? "Zasláno na retence"
                : "Poslat na retence"}
          </button>
        </div>
        {retentionStatus?.openRequest && (
          <div className="mb-4 rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-sm dark:border-amber-600/40 dark:bg-amber-900/20">
            <p className="font-semibold text-amber-200">
              Poznámka OVT — {retentionStatus.openRequest.user_id} (
              {new Date(retentionStatus.openRequest.created_at).toLocaleString("cs-CZ", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              )
            </p>
            <p className="mt-1 whitespace-pre-wrap text-amber-100">
              {retentionStatus.openRequest.reason}
            </p>
          </div>
        )}

        {/* Section 1: Základní informace */}
        <div className="mb-4">
          <CollapsibleCard
            title="Základní informace"
            open={basicInfoOpen}
            onToggle={() => setBasicInfoOpen((v) => !v)}
            headerRight={
              order.source_raynet_event_id ? (
                <a
                  href={`https://app.raynet.cz/demaxia/?view=DetailView&en=Event&ei=${order.source_raynet_event_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  Otevřít v Raynetu
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ) : undefined
            }
          >
            <div className="grid grid-cols-3 gap-4">
              {/* Row 1: Jméno spans 2 cols, Telefon */}
              <div className="col-span-2">
                <label className={labelClasses}>Jméno zákazníka / Název firmy</label>
                <input
                  type="text"
                  value={customerData.name}
                  onChange={(e) => setCustomerData((p) => ({ ...p, name: e.target.value }))}
                  className={inputClasses}
                  placeholder="Jméno a příjmení"
                />
              </div>
              <div>
                <label className={labelClasses}>Telefon</label>
                <input
                  type="tel"
                  value={customerData.phone}
                  onChange={(e) => setCustomerData((p) => ({ ...p, phone: e.target.value }))}
                  className={inputClasses}
                  placeholder="+420 ..."
                />
              </div>

              {/* Row 2: Email, Adresa spans 2 cols */}
              <div>
                <label className={labelClasses}>E-mail</label>
                <input
                  type="email"
                  value={customerData.email}
                  onChange={(e) => setCustomerData((p) => ({ ...p, email: e.target.value }))}
                  className={inputClasses}
                  placeholder="email@example.com"
                />
              </div>
              <div className="col-span-2">
                <label className={labelClasses}>Adresa</label>
                <input
                  type="text"
                  value={customerData.address}
                  onChange={(e) => setCustomerData((p) => ({ ...p, address: e.target.value }))}
                  className={inputClasses}
                  placeholder="Ulice, č.p."
                />
              </div>

              {/* Row 3: Město, PSČ, Raynet ID */}
              <div>
                <label className={labelClasses}>Město</label>
                <input
                  type="text"
                  value={customerData.city}
                  onChange={(e) => setCustomerData((p) => ({ ...p, city: e.target.value }))}
                  className={inputClasses}
                  placeholder="Město"
                />
              </div>
              <div>
                <label className={labelClasses}>PSČ</label>
                <input
                  type="text"
                  value={customerData.zipcode}
                  onChange={(e) => setCustomerData((p) => ({ ...p, zipcode: e.target.value }))}
                  className={inputClasses}
                  placeholder="PSČ"
                />
              </div>
              <div>
                <label className={labelClasses}>Raynet ID</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customerData.raynet_id}
                  onChange={(e) => setCustomerData((p) => ({ ...p, raynet_id: e.target.value }))}
                  className={inputClasses}
                  placeholder="—"
                />
              </div>

              {/* Row 4: ERP zákazník ID, ERP zakázka ID */}
              <div>
                <label className={labelClasses}>ERP zákazník ID</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customerData.erp_customer_id}
                  onChange={(e) => setCustomerData((p) => ({ ...p, erp_customer_id: e.target.value }))}
                  className={inputClasses}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClasses}>ERP zakázka ID</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customerData.source_erp_order_id}
                  onChange={(e) => setCustomerData((p) => ({ ...p, source_erp_order_id: e.target.value }))}
                  className={inputClasses}
                  placeholder="—"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="mt-5">
              <label className={labelClasses}>Poznámky</label>
              {customerData.notes ? (
                <div
                  ref={notesRef}
                  className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 [&_b]:font-semibold [&_p]:mb-1"
                  dangerouslySetInnerHTML={{ __html: customerData.notes }}
                />
              ) : (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">Žádné poznámky</p>
              )}
              <button
                type="button"
                onClick={handleOpenNotesModal}
                className="mt-2 text-sm font-medium text-accent hover:text-accent-hover"
              >
                {customerData.notes ? (notesOverflows ? "Zobrazit celé poznámky" : "Upravit poznámky") : "Přidat poznámky"}
              </button>
            </div>

            {/* Save button */}
            {customerSaveError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{customerSaveError}</p>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveCustomer}
                disabled={isSavingCustomer}
                className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {isSavingCustomer ? "Ukládám…" : "Uložit údaje"}
              </button>
            </div>
          </CollapsibleCard>
        </div>

        {/* Section 2: Výrobní formuláře */}
        <div className="mb-4">
          <CollapsibleCard
            title={`Výrobní formuláře (${step1Forms.length})`}
            open={formsOpen}
            onToggle={() => setFormsOpen((v) => !v)}
            headerRight={
              <button
                type="button"
                onClick={() => setShowAddFormModal(true)}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Přidat výrobní formulář
              </button>
            }
          >
            {duplicateError && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{duplicateError}</p>
            )}

            {step1Forms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-600">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  V této zakázce zatím nejsou žádné formuláře.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {step1Forms.map((form) => {
                  const parsedInfo = parseForm(form.form_type, form.form_json);
                  const isHighlighted = sourceFormIdsToHighlight.includes(form.id);
                  const isSelectedForAdmf = selectedFormIdsForAdmf.has(form.id);
                  const toggleAdmfSelection = () => {
                    setSelectedFormIdsForAdmf((prev) => {
                      const next = new Set(prev);
                      if (next.has(form.id)) next.delete(form.id);
                      else next.add(form.id);
                      return next;
                    });
                  };
                  return (
                    <div
                      key={form.id}
                      className={`rounded-lg border bg-white p-4 transition-all dark:bg-zinc-800 ${
                        isHighlighted
                          ? "border-amber-400 ring-2 ring-amber-400/50 dark:border-amber-500 dark:ring-amber-500/50"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <label className="mt-1 flex cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={isSelectedForAdmf}
                              onChange={toggleAdmfSelection}
                              className="h-5 w-5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500 dark:border-zinc-600 dark:bg-zinc-700"
                            />
                          </label>
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                                {FORM_TYPE_NAMES[form.form_type]}
                              </span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                                {(form.form_json as { name?: string })?.name || parsedInfo.name || form.form_type}
                              </span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">ID: {form.id}</span>
                            </div>
                            <div className="text-sm text-zinc-600 dark:text-zinc-400">
                              {parsedInfo.address && (
                                <p>
                                  {parsedInfo.address}
                                  {parsedInfo.city ? `, ${parsedInfo.city}` : ""}
                                </p>
                              )}
                              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                                Vytvořeno: {formatDate(form.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={getFormEditUrl(order.id, form.id)}
                            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
                          >
                            Upravit
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDuplicateForm(form.id)}
                            disabled={duplicatingId === form.id}
                            className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50"
                          >
                            {duplicatingId === form.id ? "Kopíruji…" : "Duplikovat"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteForm(form.id)}
                            disabled={deletingId === form.id}
                            className="rounded-md border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            {deletingId === form.id ? "Mažu…" : "Smazat"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleCard>
        </div>

        {/* Section 3: Administrativní formuláře (ADMF) */}
        <div className="mb-4">
          <CollapsibleCard
            title="Administrativní formuláře (ADMF)"
            open={admfOpen}
            onToggle={() => setAdmfOpen((v) => !v)}
            headerRight={
              selectedFormIdsForAdmf.size > 0 ? (
                <Link
                  href={`/orders/${order.id}/forms/create/admf?formIds=${Array.from(selectedFormIdsForAdmf).join(",")}`}
                  className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Generovat ADMF
                </Link>
              ) : undefined
            }
          >
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Vyberte formuláře výše a klikněte na „Generovat ADMF".
            </p>

            {admfForms.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-600">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Zatím žádný ADMF. Zaškrtněte formuláře v kroku 1 a klikněte na „Generovat ADMF".
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {admfForms.map((form) => {
                  const admfName = (form.form_json as { name?: string })?.name ?? "ADMF";
                  return (
                    <div
                      key={form.id}
                      onMouseEnter={() => setHoveredAdmfFormId(form.id)}
                      onMouseLeave={() => setHoveredAdmfFormId(null)}
                      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => setHoveredAdmfFormId((prev) => prev === form.id ? null : form.id)}
                            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                              hoveredAdmfFormId === form.id
                                ? "bg-amber-500/20 text-amber-500"
                                : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-600"
                            }`}
                            title="Zobrazit zdrojové formuláře"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <div>
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              {FORM_TYPE_NAMES.admf}
                            </span>
                            <span className="font-medium text-zinc-900 dark:text-zinc-50">{admfName}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">ID: {form.id}</span>
                            {exportStatuses[form.id] && form.id === latestExportedFormId && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Exportováno{exportStatuses[form.id].testMode ? " (test)" : ""}
                              </span>
                            )}
                            {exportStatuses[form.id] && form.id !== latestExportedFormId && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                                Dříve exportováno
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-500">
                            Vytvořeno: {formatDate(form.created_at)}
                          </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={getFormEditUrl(order.id, form.id)}
                            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
                          >
                            Upravit
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDuplicateForm(form.id)}
                            disabled={duplicatingId === form.id}
                            className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50"
                          >
                            {duplicatingId === form.id ? "Kopíruji…" : "Duplikovat"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteForm(form.id)}
                            disabled={deletingId === form.id}
                            className="rounded-md border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                          >
                            {deletingId === form.id ? "Mažu…" : "Smazat"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleCard>
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddFormModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowAddFormModal(false)}
        >
          <div
            className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-800"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-0">
              <h3 className="mb-4 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Přidat výrobní formulář
              </h3>

              {/* Search input */}
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="Hledat formulář…"
                className="w-full rounded-md border border-zinc-300 px-3 py-3 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                autoFocus={false}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {pricingLoading && (
                <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Načítám formuláře…</p>
              )}

              {pricingError && (
                <p className="py-4 text-center text-sm text-red-600 dark:text-red-400">{pricingError}</p>
              )}

              {pricingForms !== null && (() => {
                const searchLower = modalSearch.toLowerCase().trim();
                const filtered = searchLower
                  ? pricingForms.filter((item) => {
                      const display = (item.display_name ?? item.product_code).toLowerCase();
                      return (
                        item.product_code.toLowerCase().includes(searchLower) ||
                        display.includes(searchLower) ||
                        (item.manufacturer && item.manufacturer.toLowerCase().includes(searchLower))
                      );
                    })
                  : pricingForms;

                // Group by manufacturer
                const groups = new Map<string, PricingFormListItem[]>();
                for (const item of filtered) {
                  const key = item.manufacturer || "Ostatní";
                  const list = groups.get(key);
                  if (list) list.push(item);
                  else groups.set(key, [item]);
                }

                if (filtered.length === 0) {
                  return (
                    <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      {searchLower ? "Žádné formuláře nevyhovují hledání." : "Žádné formuláře nejsou k dispozici."}
                    </p>
                  );
                }

                return (
                  <div className="space-y-5">
                    {Array.from(groups.entries()).map(([manufacturer, items]) => (
                      <div key={manufacturer}>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {manufacturer}
                        </p>
                        <div className="space-y-2">
                          {items.map((item) => {
                            const label = item.display_name?.trim() || item.product_code;
                            const showCode =
                              label.toLowerCase() !== item.product_code.toLowerCase();
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => goToCustomFormWithPricing(item.id)}
                                className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-4 text-left text-sm font-medium text-zinc-800 transition-colors hover:border-primary hover:bg-primary/10 active:bg-primary/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:border-primary dark:hover:bg-primary/20"
                              >
                                <span className="block">{label}</span>
                                {showCode && (
                                  <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                    {item.product_code}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="border-t border-zinc-200 p-6 pt-4 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setShowAddFormModal(false)}
                className="w-full rounded-lg px-4 py-3 text-center text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes editable modal */}
      {showNotesModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notes-modal-title"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNotesModal(false); }}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-700 pb-3">
            <h2 id="notes-modal-title" className="text-lg font-semibold text-zinc-50">
              Poznámky
            </h2>
            <div className="flex items-center gap-2">
              {order.source_raynet_event_id && (
                <button
                  type="button"
                  onClick={handleSaveNotesToRaynet}
                  disabled={isSavingNotes}
                  className="min-h-[44px] rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {isSavingNotes ? "Ukládám…" : "Uložit do Raynetu"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowNotesModal(false)}
                className="min-h-[44px] rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500"
              >
                Zavřít
              </button>
            </div>
          </div>
          {notesSaveError && (
            <p className="mt-2 text-sm text-red-400">{notesSaveError}</p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            <div
              ref={notesEditorRef}
              contentEditable
              suppressContentEditableWarning
              className="min-h-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm leading-relaxed text-zinc-200 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent [&_b]:font-semibold [&_p]:mb-1"
              dangerouslySetInnerHTML={{ __html: customerData.notes || "" }}
            />
          </div>
        </div>
      )}

      {/* Retention modal — "Poslat na retence" */}
      {showRetentionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-lg bg-zinc-800 p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-50">Poslat na retence</h2>
              <button
                type="button"
                onClick={() => !retentionSubmitting && setShowRetentionModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Zavřít"
              >
                ✕
              </button>
            </div>

            {(retentionStatus?.inRetention || retentionStatus?.inRetentionRequested) && !retentionResendAcknowledged ? (
              <>
                <p className="mb-2 text-sm text-zinc-300">
                  {retentionStatus?.inRetention
                    ? "Tato zakázka je v retencích"
                    : "Žádost o retenci už byla odeslána"}
                  {retentionStatus.latest?.created_at
                    ? ` (${new Date(retentionStatus.latest.created_at).toLocaleString("cs-CZ", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })})`
                    : ""}
                  .
                </p>
                <p className="mb-6 text-sm text-zinc-400">
                  Opravdu chcete odeslat novou žádost?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRetentionModal(false)}
                    className="rounded-md bg-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-500"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetentionResendAcknowledged(true)}
                    className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
                  >
                    Přesto odeslat
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mb-2 block text-sm font-medium text-zinc-300">
                  Důvod odeslání na retence
                </label>
                <textarea
                  value={retentionReason}
                  onChange={(e) => setRetentionReason(e.target.value)}
                  disabled={retentionSubmitting}
                  rows={5}
                  placeholder="Stručně popište důvod (zákazník bude přesměrován na oddělení retencí)"
                  className="mb-3 w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {retentionError && (
                  <p className="mb-3 text-sm text-red-400">{retentionError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRetentionModal(false)}
                    disabled={retentionSubmitting}
                    className="rounded-md bg-zinc-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-500 disabled:opacity-50"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitRetention}
                    disabled={retentionSubmitting || retentionReason.trim().length === 0}
                    className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {retentionSubmitting ? "Odesílám…" : "Odeslat na retence"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
