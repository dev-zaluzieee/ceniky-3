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
  const notesRef = useRef<HTMLDivElement>(null);
  const [notesOverflows, setNotesOverflows] = useState(false);

  // Export status per ADMF form: formId → { exportedAt, testMode }
  const [exportStatuses, setExportStatuses] = useState<Record<number, { exportedAt: string; testMode: boolean }>>({});

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

        {/* Page title with date + customer name */}
        <h1 className="mb-5 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {pageTitle}
        </h1>

        {/* Section 1: Základní informace */}
        <div className="mb-4">
          <CollapsibleCard
            title="Základní informace"
            open={basicInfoOpen}
            onToggle={() => setBasicInfoOpen((v) => !v)}
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

            {/* Notes (read-only) */}
            {customerData.notes && (
              <div className="mt-5">
                <label className={labelClasses}>Poznámky</label>
                <div
                  ref={notesRef}
                  className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {customerData.notes}
                </div>
                {notesOverflows && (
                  <button
                    type="button"
                    onClick={() => setShowNotesModal(true)}
                    className="mt-2 text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    Zobrazit celé poznámky
                  </button>
                )}
              </div>
            )}

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

      {/* Notes fullscreen modal */}
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
            <button
              type="button"
              onClick={() => setShowNotesModal(false)}
              className="min-h-[44px] rounded-lg bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-500"
            >
              Zavřít
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
              {customerData.notes}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
