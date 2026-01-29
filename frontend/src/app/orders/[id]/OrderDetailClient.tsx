"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import type { OrderRecord } from "@/lib/orders-api";
import { updateOrder } from "@/lib/orders-api";
import type { FormRecord, FormType, PaginationInfo } from "@/lib/forms-api";
import { getFormById, submitForm } from "@/lib/forms-api";
import { parseForm } from "@/parsers/forms";

/** Form type to display name (Czech) */
const FORM_TYPE_NAMES: Record<FormType, string> = {
  "horizontalni-zaluzie": "Horizontální žaluzie",
  "plise-zaluzie": "Plisé žaluzie",
  site: "Okenní sítě / Dveřní sítě",
  "textile-rolety": "Textilní a D/N roletky",
  universal: "Univerzální list",
};

/** Form type to path (create new form with orderId) */
const FORM_TYPE_PATHS: Record<FormType, string> = {
  "horizontalni-zaluzie": "/forms/horizontalni-zaluzie",
  "plise-zaluzie": "/forms/plise-zaluzie",
  site: "/forms/site",
  "textile-rolety": "/forms/textile-rolety",
  universal: "/forms/universal",
};

function getEditUrl(formType: FormType, formId: number): string | null {
  switch (formType) {
    case "universal":
      return `/forms/universal/${formId}`;
    case "horizontalni-zaluzie":
      return `/forms/horizontalni-zaluzie/${formId}`;
    case "plise-zaluzie":
      return `/forms/plise-zaluzie/${formId}`;
    case "site":
      return `/forms/site/${formId}`;
    case "textile-rolety":
      return `/forms/textile-rolety/${formId}`;
    default:
      return null;
  }
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

interface OrderDetailClientProps {
  order: OrderRecord;
  forms: FormRecord[];
  formsPagination: PaginationInfo | null;
}

/**
 * Client component for order detail
 * Shows customer (read-only), list of forms, add/edit/delete forms
 */
export default function OrderDetailClient({
  order: initialOrder,
  forms: initialForms,
  formsPagination,
}: OrderDetailClientProps) {
  const [order, setOrder] = useState(initialOrder);
  const [forms, setForms] = useState(initialForms);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  /** Editable customer data (synced from order) */
  const [customerData, setCustomerData] = useState({
    name: initialOrder.name ?? "",
    email: initialOrder.email ?? "",
    phone: initialOrder.phone ?? "",
    address: initialOrder.address ?? "",
    city: initialOrder.city ?? "",
    zipcode: initialOrder.zipcode ?? "",
    raynet_id: initialOrder.raynet_id != null ? String(initialOrder.raynet_id) : "",
    erp_customer_id: initialOrder.erp_customer_id != null ? String(initialOrder.erp_customer_id) : "",
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
    });
  }, [initialOrder]);

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

  /** Duplicate a form: fetch full form, create new with same type/json under this order */
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

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        {/* Back link */}
        <Link
          href="/orders"
          className="mb-4 flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Zpět na zakázky
        </Link>

        {/* Order header – customer (editable) */}
        <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h1 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Zakázka #{order.id}
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Jméno</label>
              <input
                type="text"
                value={customerData.name}
                onChange={(e) => setCustomerData((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="Jméno a příjmení"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Email</label>
              <input
                type="email"
                value={customerData.email}
                onChange={(e) => setCustomerData((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Telefon</label>
              <input
                type="tel"
                value={customerData.phone}
                onChange={(e) => setCustomerData((p) => ({ ...p, phone: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="+420 ..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Adresa</label>
              <input
                type="text"
                value={customerData.address}
                onChange={(e) => setCustomerData((p) => ({ ...p, address: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="Ulice, č.p."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Město</label>
              <input
                type="text"
                value={customerData.city}
                onChange={(e) => setCustomerData((p) => ({ ...p, city: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="Město"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">PSČ</label>
              <input
                type="text"
                value={customerData.zipcode}
                onChange={(e) => setCustomerData((p) => ({ ...p, zipcode: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="PSČ"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Raynet ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={customerData.raynet_id}
                onChange={(e) => setCustomerData((p) => ({ ...p, raynet_id: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="—"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">ERP zákazník ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={customerData.erp_customer_id}
                onChange={(e) => setCustomerData((p) => ({ ...p, erp_customer_id: e.target.value }))}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                placeholder="—"
              />
            </div>
          </div>
          {customerSaveError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{customerSaveError}</p>
          )}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleSaveCustomer}
              disabled={isSavingCustomer}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSavingCustomer ? "Ukládám…" : "Uložit údaje zákazníka"}
            </button>
          </div>
        </div>

        {/* Forms section */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Formuláře v zakázce
          </h2>
          <div className="flex items-center gap-2">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Přidat formulář
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FORM_TYPE_PATHS) as FormType[]).map((formType) => (
                  <Link
                    key={formType}
                    href={`${FORM_TYPE_PATHS[formType]}?orderId=${order.id}`}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                  >
                    {FORM_TYPE_NAMES[formType]}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Zavřít
                </button>
              </div>
            )}
          </div>
        </div>

        {formsPagination && (
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
            Celkem {formsPagination.total} formulář{formsPagination.total !== 1 ? "ů" : ""}
          </p>
        )}

        {duplicateError && (
          <p className="mb-2 text-sm text-red-600 dark:text-red-400">{duplicateError}</p>
        )}

        {/* Forms list */}
        {forms.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400">
              V této zakázce zatím nejsou žádné formuláře. Klikněte na „Přidat formulář“ a vyberte typ.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {forms.map((form) => {
              const parsedInfo = parseForm(form.form_type, form.form_json);
              const editUrl = getEditUrl(form.form_type, form.id);
              return (
                <div
                  key={form.id}
                  className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                          {FORM_TYPE_NAMES[form.form_type]}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          ID: {form.id}
                        </span>
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
                    <div className="flex items-center gap-2">
                      {editUrl && (
                        <Link
                          href={editUrl}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Upravit
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDuplicateForm(form.id)}
                        disabled={duplicatingId === form.id}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50"
                      >
                        {duplicatingId === form.id ? "Kopíruji…" : "Duplikovat"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteForm(form.id)}
                        disabled={deletingId === form.id}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
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
      </div>
    </div>
  );
}
