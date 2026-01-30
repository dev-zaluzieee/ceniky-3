"use client";

import { useState } from "react";
import Link from "next/link";
import { submitForm, updateForm } from "@/lib/forms-api";
import { generateAdmfPdf } from "@/lib/admf-pdf";
import type { AdmfFormData, AdmfProductRow } from "@/types/forms/admf.types";

/** Customer data from order (read-only when under order) */
interface CustomerFromOrder {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
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
    doplnujiciInformaceObjednavky: "",
    doplnujiciInformaceMontaz: "",
  };
}

function recalcCenaPoSleve(row: AdmfProductRow): number {
  return Math.round(row.cena * (1 - row.sleva / 100));
}

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
    }
    return d;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  /** Modal: "Uložit a odeslat zákazníkovi" – dev mode message */
  const [showSendModal, setShowSendModal] = useState(false);
  /** Loading PDF (font + generate); error message if PDF generation fails */
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

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
    try {
      if (isEditMode && formId) {
        const res = await updateForm(formId, formData);
        if (!res.success) {
          setSubmitError(res.error ?? "Uložení se nepodařilo.");
          return;
        }
        setSubmitSuccess(true);
      } else {
        if (orderId == null) {
          setSubmitError("Zakázka není vybrána.");
          return;
        }
        const res = await submitForm("admf", formData, orderId);
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

  const totalCenaPoSleve = formData.productRows.reduce((sum, r) => sum + (r.cenaPoSleve || 0), 0);

  /** Generate PDF (with Czech font) and open in new tab (preview for customer) */
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

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={orderId != null ? `/orders/${orderId}` : "/"}
            className="flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {orderId != null ? "Zpět k zakázce" : "Zpět na výběr formulářů"}
          </Link>
          {/* ADMF actions menu: preview PDF, save & send to customer */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShowPreview}
              disabled={pdfLoading}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50"
            >
              {pdfLoading ? (
                <>Generuji PDF…</>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Zobrazit zákazníkovi
                </>
              )}
            </button>
            {pdfError && (
              <p className="text-sm text-red-600 dark:text-red-400">{pdfError}</p>
            )}
            <button
              type="button"
              onClick={() => setShowSendModal(true)}
              className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Uložit a odeslat zákazníkovi
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
            <div className="max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
              <h2 id="send-modal-title" className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Uložit a odeslat zákazníkovi
              </h2>
              <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
                V testovacím režimu neodesíláme e-maily zákazníkům ani neukládáme data do ERP a Raynet.
                V režimu vývoje je tato operace blokována.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="rounded-md bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500"
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        )}

        <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          ADMINISTRATIVNÍ FORMULÁŘ
          {isEditMode && <span className="ml-3 text-lg font-normal text-zinc-500 dark:text-zinc-400">(Úprava)</span>}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Name (Varianta 1, Varianta 2, …) */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Název varianty</h2>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
              placeholder="Varianta 1"
            />
          </div>

          {/* Customer block (from order) – optional display */}
          {customerFromOrder && (customerFromOrder.name || customerFromOrder.email || customerFromOrder.phone) && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/50">
              <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Údaje zákazníka (z zakázky)</h2>
              <div className="grid gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                {customerFromOrder.name && <p><strong>Jméno:</strong> {customerFromOrder.name}</p>}
                {customerFromOrder.email && <p><strong>E-mail:</strong> {customerFromOrder.email}</p>}
                {customerFromOrder.phone && <p><strong>Telefon:</strong> {customerFromOrder.phone}</p>}
                {customerFromOrder.address && <p><strong>Adresa:</strong> {customerFromOrder.address}</p>}
                {customerFromOrder.city && <p><strong>Město:</strong> {customerFromOrder.city}</p>}
              </div>
            </div>
          )}

          {/* Záznam o jednání se zákazníkem – product table */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Záznam o jednání se zákazníkem</h2>
            {/* Table with generous column spacing for a cleaner layout */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-600">
                    <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">produkt</th>
                    <th className="w-20 px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">ks</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">rám</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">lamela/látka</th>
                    <th className="w-28 px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">cena</th>
                    <th className="w-24 px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">sleva %</th>
                    <th className="w-32 px-4 py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">cena po slevě</th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {formData.productRows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-700">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.produkt}
                          onChange={(e) => updateProductRow(row.id, { produkt: e.target.value })}
                          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          value={row.ks}
                          onChange={(e) => updateProductRow(row.id, { ks: parseInt(e.target.value, 10) || 1 })}
                          className="w-14 rounded border border-zinc-300 px-3 py-2 text-right dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.ram}
                          onChange={(e) => updateProductRow(row.id, { ram: e.target.value })}
                          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.lamelaLatka}
                          onChange={(e) => updateProductRow(row.id, { lamelaLatka: e.target.value })}
                          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={row.cena || ""}
                          onChange={(e) => updateProductRow(row.id, { cena: parseInt(e.target.value, 10) || 0 })}
                          className="w-24 rounded border border-zinc-300 px-3 py-2 text-right dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.sleva || ""}
                          onChange={(e) => updateProductRow(row.id, { sleva: parseInt(e.target.value, 10) || 0 })}
                          className="w-20 rounded border border-zinc-300 px-3 py-2 text-right dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{row.cenaPoSleve}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => removeProductRow(row.id)}
                          className="rounded px-1 py-0.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                          title="Odebrat řádek"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-right text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Celkem: {totalCenaPoSleve} Kč
            </p>
            <button
              type="button"
              onClick={addProductRow}
              className="mt-3 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            >
              + Přidat řádek
            </button>
          </div>

          {/* Doplňující informace */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-800">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Doplňující informace</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Doplňující informace pro objednávky
                </label>
                <textarea
                  value={formData.doplnujiciInformaceObjednavky ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, doplnujiciInformaceObjednavky: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Doplňující informace pro montáž
                </label>
                <textarea
                  value={formData.doplnujiciInformaceMontaz ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, doplnujiciInformaceMontaz: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                />
              </div>
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}
          {submitSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400">Formulář byl uložen.</p>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {isSubmitting ? "Ukládám…" : isEditMode ? "Uložit změny" : "Vytvořit formulář"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
