"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
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

function getFormCreateUrl(orderId: number, formType: FormType): string {
  return `/orders/${orderId}/forms/create/${formType}`;
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
    notes: initialOrder.notes ?? "",
  });
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [customerSaveError, setCustomerSaveError] = useState<string | null>(null);

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
        notes: customerData.notes || null,
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

              {/* Row 4: ERP zákazník ID */}
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
            </div>

            {/* Notes */}
            <div className="mt-5">
              <label className={labelClasses}>Poznámky</label>
              <textarea
                value={customerData.notes}
                onChange={(e) => setCustomerData((p) => ({ ...p, notes: e.target.value }))}
                rows={4}
                className={`${inputClasses} resize-y`}
                placeholder="Poznámky k zakázce..."
              />
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
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">ID: {form.id}</span>
                            </div>
                            <div className="text-sm text-zinc-600 dark:text-zinc-400">
                              {parsedInfo.name && <p>{parsedInfo.name}</p>}
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
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <span className="inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              {FORM_TYPE_NAMES.admf}
                            </span>
                            <span className="font-medium text-zinc-900 dark:text-zinc-50">{admfName}</span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">ID: {form.id}</span>
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-500">
                            Vytvořeno: {formatDate(form.created_at)}
                          </p>
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
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-5 text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Přidat výrobní formulář
            </h3>

            {pricingLoading && (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Načítám formuláře…</p>
            )}

            {pricingError && (
              <p className="py-4 text-center text-sm text-red-600 dark:text-red-400">{pricingError}</p>
            )}

            {pricingForms !== null && (
              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
                {pricingForms.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    Žádné formuláře nejsou k dispozici.
                  </p>
                ) : (
                  pricingForms.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goToCustomFormWithPricing(item.id)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-4 text-center text-sm font-medium text-zinc-800 transition-colors hover:border-primary hover:bg-primary/10 active:bg-primary/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:border-primary dark:hover:bg-primary/20"
                    >
                      {item.product_code}
                      {item.manufacturer && (
                        <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                          ({item.manufacturer})
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Fallback: custom JSON */}
            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
              <Link
                href={getFormCreateUrl(order.id, "custom")}
                className="block w-full rounded-lg border border-zinc-300 px-4 py-3 text-center text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Vlastní formulář (vložit JSON)
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setShowAddFormModal(false)}
              className="mt-3 w-full rounded-lg px-4 py-3 text-center text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Zavřít
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
