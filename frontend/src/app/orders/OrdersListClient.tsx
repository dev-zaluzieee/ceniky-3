"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OrderRecord,
  OrdersPaginationInfo,
  createOrder,
  getOrders,
} from "@/lib/orders-api";
import { searchCustomersDual, validateCustomerPair } from "@/lib/customers-api";
import { RaynetLead } from "@/types/raynet.types";
import { ErpCustomer } from "@/types/erp.types";
import type { CustomerPrefill } from "@/lib/customers-api";

interface OrdersListClientProps {
  orders: OrderRecord[];
  pagination: OrdersPaginationInfo | null;
  error: string | null;
}

/** Format date to Czech locale */
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

/**
 * Client component for orders list
 * Supports create order flow (customer lookup same as in forms)
 */
export default function OrdersListClient({
  orders: initialOrders,
  pagination: initialPagination,
  error: initialError,
}: OrdersListClientProps) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [pagination, setPagination] = useState(initialPagination);
  const [error, setError] = useState<string | null>(initialError);

  // Create order flow state
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [phone, setPhone] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [raynetCandidates, setRaynetCandidates] = useState<RaynetLead[]>([]);
  const [erpCandidates, setErpCandidates] = useState<ErpCustomer[]>([]);
  const [selectedRaynet, setSelectedRaynet] = useState<RaynetLead | null>(null);
  const [selectedErp, setSelectedErp] = useState<ErpCustomer | null>(null);
  const [pairWarning, setPairWarning] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /** When validation has conflicts, show warning; form is always editable */
  const [showConflictForm, setShowConflictForm] = useState(false);
  /** Unified customer form: used for 0, 1, or 2 (conflict) selection; all fields optional */
  const [manualFormData, setManualFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    zipcode: "",
  });

  /** Prefill form when only Raynet or only ERP is selected (no validation) */
  useEffect(() => {
    if (selectedRaynet && !selectedErp) {
      const r = selectedRaynet;
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "";
      setManualFormData({
        name,
        email: r.contactInfo?.email ?? "",
        phone: r.contactInfo?.tel1 ?? "",
        address: r.address?.street ?? "",
        city: r.address?.city ?? "",
        zipcode: r.address?.zipCode ?? "",
      });
    } else if (selectedErp && !selectedRaynet) {
      const e = selectedErp;
      setManualFormData({
        name: e.name ?? "",
        email: e.email ?? "",
        phone: e.phone ?? "",
        address: e.address ?? "",
        city: e.city ?? "",
        zipcode: e.zipcode ?? "",
      });
    }
  }, [selectedRaynet, selectedErp]);

  const handlePhoneSearch = async () => {
    const trimmed = phone.trim();
    if (!trimmed || trimmed.length < 6) {
      setSearchError("Zadejte platné telefonní číslo (minimálně 6 číslic)");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setRaynetCandidates([]);
    setErpCandidates([]);
    setSelectedRaynet(null);
    setSelectedErp(null);
    setPairWarning(null);
    setShowConflictForm(false);

    try {
      const result = await searchCustomersDual(trimmed);
      if (!result.success) {
        setSearchError(result.error || "Nepodařilo se vyhledat zákazníka");
        return;
      }
      if (result.data) {
        setRaynetCandidates(result.data.raynet.customers);
        setErpCandidates(result.data.erp.customers);
        if (
          result.data.raynet.customers.length === 0 &&
          result.data.erp.customers.length === 0
        ) {
          setSearchError(
            "Zákazník s tímto telefonním číslem nebyl nalezen v Raynet ani ERP"
          );
        }
      } else {
        setSearchError("Nepodařilo se načíst výsledky vyhledávání");
      }
    } catch (e: any) {
      setSearchError("Došlo k chybě při vyhledávání. Zkuste to prosím znovu.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleValidateAndCreate = async () => {
    if (!selectedRaynet || !selectedErp) {
      setPairWarning("Pro ověření vyberte 1 zákazníka z Raynetu i z ERP.");
      return;
    }

    setIsValidating(true);
    setPairWarning(null);
    setCreateError(null);

    try {
      const result = await validateCustomerPair(selectedRaynet, selectedErp);
      if (!result.success || !result.data) {
        setPairWarning(
          result.error || "Nepodařilo se ověřit dvojici Raynet + ERP."
        );
        return;
      }
      if (!result.data.ok) {
        // Conflict: show editable form prefilled from ERP, let user fix and save
        setPairWarning(
          result.data.warning ||
            "KONFLIKT DAT: dvojice Raynet + ERP se neshoduje."
        );
        setManualFormData({
          name: selectedErp.name ?? "",
          email: selectedErp.email ?? "",
          phone: selectedErp.phone ?? "",
          address: selectedErp.address ?? "",
          city: selectedErp.city ?? "",
          zipcode: selectedErp.zipcode ?? "",
        });
        setShowConflictForm(true);
        return;
      }

      const prefill: CustomerPrefill | undefined = result.data.prefill;
      if (!prefill) {
        setPairWarning("Chybí data pro vytvoření zakázky.");
        return;
      }

      setIsCreating(true);
      const createResult = await createOrder({
        name: prefill.name,
        email: prefill.email,
        phone: prefill.phone,
        address: prefill.address,
        city: prefill.city,
        zipcode: prefill.zipcode,
        raynet_id: prefill.raynet_id,
        erp_customer_id: prefill.erp_customer_id,
      });

      if (!createResult.success) {
        setCreateError(
          createResult.error || "Nepodařilo se vytvořit zakázku."
        );
        return;
      }
      if (createResult.data?.id) {
        router.push(`/orders/${createResult.data.id}`);
        return;
      }
      setCreateError("Zakázka byla vytvořena, ale ID nebylo vráceno.");
    } catch (e: any) {
      setCreateError("Došlo k chybě. Zkuste to prosím znovu.");
    } finally {
      setIsValidating(false);
      setIsCreating(false);
    }
  };

  /** Create order from manual form (0, 1, or 2 selected with conflict; all fields optional) */
  const handleCreateFromManualForm = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const createResult = await createOrder({
        name: manualFormData.name || undefined,
        email: manualFormData.email || undefined,
        phone: manualFormData.phone || undefined,
        address: manualFormData.address || undefined,
        city: manualFormData.city || undefined,
        zipcode: manualFormData.zipcode || undefined,
        raynet_id: selectedRaynet?.id,
        erp_customer_id: selectedErp?.id,
      });
      if (!createResult.success) {
        setCreateError(createResult.error || "Nepodařilo se vytvořit zakázku.");
        return;
      }
      if (createResult.data?.id) {
        router.push(`/orders/${createResult.data.id}`);
        return;
      }
      setCreateError("Zakázka byla vytvořena, ale ID nebylo vráceno.");
    } catch (e: any) {
      setCreateError("Došlo k chybě. Zkuste to prosím znovu.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloseCreateFlow = () => {
    setShowCreateFlow(false);
    setPhone("");
    setSearchError(null);
    setRaynetCandidates([]);
    setErpCandidates([]);
    setSelectedRaynet(null);
    setSelectedErp(null);
    setPairWarning(null);
    setCreateError(null);
    setShowConflictForm(false);
    setManualFormData({ name: "", email: "", phone: "", address: "", city: "", zipcode: "" });
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 dark:bg-zinc-900">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="mb-4 flex items-center gap-2 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              Zakázky
            </h1>
            <button
              type="button"
              onClick={() => setShowCreateFlow(true)}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 dark:focus:ring-offset-zinc-800"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Založit zakázku
            </button>
          </div>
          {pagination && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Celkem {pagination.total} zakázek
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-sm font-medium text-red-800 dark:text-red-400">
              {error}
            </p>
          </div>
        )}

        {/* Create order flow (modal-like overlay) */}
        {showCreateFlow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Založit zakázku – vyhledat zákazníka
                </h2>
                <button
                  type="button"
                  onClick={handleCloseCreateFlow}
                  className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Telefon
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handlePhoneSearch())}
                      className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                      placeholder="+420 ..."
                      disabled={isSearching}
                    />
                    <button
                      type="button"
                      onClick={handlePhoneSearch}
                      disabled={isSearching || phone.trim().length < 6}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      {isSearching ? "Vyhledávám..." : "Vyhledat"}
                    </button>
                  </div>
                  {searchError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{searchError}</p>
                  )}
                </div>

                {(raynetCandidates.length > 0 || erpCandidates.length > 0) && (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        Volitelně vyberte zákazníka z Raynetu a/nebo ERP pro předvyplnění (0, 1 nebo 2).
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          Raynet ({raynetCandidates.length})
                        </p>
                        <div className="max-h-48 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700">
                          {raynetCandidates.map((c) => (
                            <div
                              key={c.id}
                              className={`border-b border-zinc-200 px-3 py-2 last:border-0 dark:border-zinc-700 ${
                                selectedRaynet?.id === c.id ? "bg-accent/10 dark:bg-accent/20" : ""
                              }`}
                            >
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {c.firstName} {c.lastName}
                              </p>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                Tel: {c.contactInfo?.tel1 || "—"} | Raynet #{c.id}
                              </p>
                              <button
                                type="button"
                                onClick={() => setSelectedRaynet(c)}
                                className="mt-1 text-xs font-medium text-accent"
                              >
                                {selectedRaynet?.id === c.id ? "Vybráno" : "Vybrat"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          ERP ({erpCandidates.length})
                        </p>
                        <div className="max-h-48 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700">
                          {erpCandidates.map((c) => (
                            <div
                              key={c.id}
                              className={`border-b border-zinc-200 px-3 py-2 last:border-0 dark:border-zinc-700 ${
                                selectedErp?.id === c.id ? "bg-accent/10 dark:bg-accent/20" : ""
                              }`}
                            >
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                {c.name || "—"}
                              </p>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                                Tel: {c.phone || "—"} | ERP #{c.id}
                              </p>
                              <button
                                type="button"
                                onClick={() => setSelectedErp(c)}
                                className="mt-1 text-xs font-medium text-accent"
                              >
                                {selectedErp?.id === c.id ? "Vybráno" : "Vybrat"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {pairWarning && !showConflictForm && (
                      <div className="border-t border-zinc-200 px-4 py-2 text-sm text-red-600 dark:border-zinc-700 dark:text-red-400">
                        {pairWarning}
                      </div>
                    )}
                    {createError && (
                      <div className="border-t border-zinc-200 px-4 py-2 text-sm text-red-600 dark:border-zinc-700 dark:text-red-400">
                        {createError}
                      </div>
                    )}
                    <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                      {selectedRaynet && selectedErp ? (
                        <button
                          type="button"
                          onClick={handleValidateAndCreate}
                          disabled={isValidating || isCreating}
                          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          {isCreating ? "Vytvářím zakázku..." : isValidating ? "Ověřuji..." : "Ověřit a založit zakázku"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}

                {/* Customer form: always visible; for 0/1 selection or conflict (2 selected) */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      Údaje zákazníka (vše volitelné, lze upravit)
                    </p>
                  </div>
                  {showConflictForm && pairWarning && (
                    <div className="border-b border-amber-200 px-4 py-2 dark:border-amber-700">
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-200">
                        ⚠️ {pairWarning}
                      </div>
                    </div>
                  )}
                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Jméno</label>
                        <input
                          type="text"
                          value={manualFormData.name}
                          onChange={(e) => setManualFormData((p) => ({ ...p, name: e.target.value }))}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="Jméno a příjmení"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Email</label>
                        <input
                          type="email"
                          value={manualFormData.email}
                          onChange={(e) => setManualFormData((p) => ({ ...p, email: e.target.value }))}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="email@example.com"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Telefon</label>
                        <input
                          type="tel"
                          value={manualFormData.phone}
                          onChange={(e) => setManualFormData((p) => ({ ...p, phone: e.target.value }))}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="+420 ..."
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Adresa</label>
                        <input
                          type="text"
                          value={manualFormData.address}
                          onChange={(e) => setManualFormData((p) => ({ ...p, address: e.target.value }))}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="Ulice, č.p."
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Město</label>
                        <input
                          type="text"
                          value={manualFormData.city}
                          onChange={(e) => setManualFormData((p) => ({ ...p, city: e.target.value }))}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="Město"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">PSČ</label>
                        <input
                          type="text"
                          value={manualFormData.zipcode}
                          onChange={(e) => setManualFormData((p) => ({ ...p, zipcode: e.target.value }))}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-50"
                          placeholder="PSČ"
                        />
                      </div>
                    </div>
                    {createError && (
                      <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCreateFromManualForm}
                        disabled={isCreating}
                        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {isCreating ? "Vytvářím zakázku..." : "Založit zakázku"}
                      </button>
                      {showConflictForm && (
                        <button
                          type="button"
                          onClick={() => { setShowConflictForm(false); setPairWarning(null); }}
                          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        >
                          Zavřít varování
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!error && orders.length === 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-800">
            <p className="text-zinc-600 dark:text-zinc-400">
              Zatím nemáte žádné zakázky. Klikněte na „Založit zakázku“ a vyhledejte zákazníka podle telefonu.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateFlow(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Založit zakázku
            </button>
          </div>
        )}

        {/* Orders list */}
        {!error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {order.name || "—"}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Zakázka #{order.id}
                      </span>
                    </div>
                    <div className="space-y-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {order.phone && <p>Tel: {order.phone}</p>}
                      {order.address && (
                        <p>
                          {order.address}
                          {order.city ? `, ${order.city}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                    Vytvořeno: {formatDate(order.created_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
