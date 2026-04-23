"use client";

import { useEffect, useState } from "react";
import { searchCustomersDual } from "@/lib/customers-api";
import { fetchErpOrdersByCustomerId } from "@/lib/erp-api";
import { createOrder } from "@/lib/orders-api";
import { ErpCustomer, ErpOrder } from "@/types/erp.types";
import type { RaynetEvent } from "@/lib/raynet-events";

interface CreateOrderFromEventModalProps {
  event: RaynetEvent;
  prefillPhone: string | null;
  prefillAddress: string | null;
  onClose: () => void;
  onOrderCreated: (orderId: number) => void;
}

/**
 * Convert Raynet event HTML description to plain text notes for the order.
 * The order detail notes field is plain text, so HTML tags should not be persisted.
 */
function extractEventNotes(description: string | null): string | null {
  if (!description) return null;

  const text = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text.length > 0 ? text : null;
}

/** Format a date string for display. */
function formatErpDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/** Status label for display. */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Čeká",
    in_progress: "Probíhá",
    completed: "Dokončeno",
    cancelled: "Zrušeno",
  };
  return map[status] ?? status;
}

/** Status badge color classes. */
function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-900/40 text-emerald-400";
    case "cancelled":
      return "bg-red-900/40 text-red-400";
    case "in_progress":
      return "bg-blue-900/40 text-blue-400";
    default:
      return "bg-zinc-700 text-zinc-300";
  }
}

export default function CreateOrderFromEventModal({
  event,
  prefillPhone,
  prefillAddress,
  onClose,
  onOrderCreated,
}: CreateOrderFromEventModalProps) {
  // Step 1: ERP customer search
  const [phone, setPhone] = useState(prefillPhone ?? "");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [erpCandidates, setErpCandidates] = useState<ErpCustomer[]>([]);
  const [selectedErp, setSelectedErp] = useState<ErpCustomer | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [skippedErp, setSkippedErp] = useState(false);

  // Step 2: ERP order pairing
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [erpOrders, setErpOrders] = useState<ErpOrder[]>([]);
  const [selectedErpOrder, setSelectedErpOrder] = useState<ErpOrder | null>(null);
  const [erpOrderError, setErpOrderError] = useState<string | null>(null);
  const [skippedErpOrder, setSkippedErpOrder] = useState(false);

  // Step 3: Order creation
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Editable customer form — pre-filled from ERP selection
  const [formData, setFormData] = useState({
    name: event.company?.name ?? "",
    email: "",
    phone: prefillPhone ?? "",
    address: prefillAddress ?? "",
    city: event.companyAddress?.city ?? "",
    zipcode: event.companyAddress?.zipCode ?? "",
  });

  // Step 2 is ready when ERP customer is selected (or skipped)
  const customerDone = selectedErp !== null || skippedErp;
  // Step 3 (form) is ready when ERP order is selected, skipped, or customer was skipped entirely
  const canCreate = skippedErp || selectedErpOrder !== null || skippedErpOrder;

  // --- Step 1: ERP customer search ---

  const doErpSearch = async (searchPhone: string) => {
    const trimmed = searchPhone.trim();
    if (!trimmed || trimmed.length < 6) {
      setSearchError("Zadejte platné telefonní číslo (minimálně 6 číslic)");
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    setErpCandidates([]);
    setSelectedErp(null);
    setSkippedErp(false);
    // Reset order step
    setErpOrders([]);
    setSelectedErpOrder(null);
    setSkippedErpOrder(false);
    setErpOrderError(null);

    try {
      const result = await searchCustomersDual(trimmed);
      if (!result.success) {
        setSearchError(result.error || "Nepodařilo se vyhledat v ERP");
        return;
      }
      const erp = result.data?.erp;
      if (!erp || erp.customers.length === 0) {
        setSearchError("Zákazník s tímto telefonním číslem nebyl nalezen v ERP");
        return;
      }
      setErpCandidates(erp.customers);
    } catch {
      setSearchError("Došlo k chybě při vyhledávání. Zkuste to prosím znovu.");
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  // Auto-search on mount if phone is available
  useEffect(() => {
    if (prefillPhone && prefillPhone.trim().length >= 6) {
      doErpSearch(prefillPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectErp = (erp: ErpCustomer) => {
    setSelectedErp(erp);
    setSkippedErp(false);
    // Reset order step when customer changes
    setErpOrders([]);
    setSelectedErpOrder(null);
    setSkippedErpOrder(false);
    setErpOrderError(null);
    // Pre-fill form from ERP data (keep Raynet data as fallback)
    setFormData({
      name: erp.name ?? event.company?.name ?? "",
      email: erp.email ?? "",
      phone: erp.phone ?? prefillPhone ?? "",
      address: erp.address ?? prefillAddress ?? "",
      city: erp.city ?? event.companyAddress?.city ?? "",
      zipcode: erp.zipcode ?? event.companyAddress?.zipCode ?? "",
    });
  };

  const handleSkipErp = () => {
    setSkippedErp(true);
    setSelectedErp(null);
    // Reset order step
    setErpOrders([]);
    setSelectedErpOrder(null);
    setSkippedErpOrder(false);
    setErpOrderError(null);
  };

  // --- Step 2: ERP order fetch (auto-triggered when customer is selected) ---

  useEffect(() => {
    if (!selectedErp) return;

    let cancelled = false;
    setIsLoadingOrders(true);
    setErpOrderError(null);
    setErpOrders([]);
    setSelectedErpOrder(null);
    setSkippedErpOrder(false);

    (async () => {
      try {
        const result = await fetchErpOrdersByCustomerId(selectedErp.id);
        if (cancelled) return;

        if (!result.success) {
          setErpOrderError(result.error || "Nepodařilo se načíst zakázky z ERP");
          return;
        }

        const orders = result.data?.orders ?? [];
        setErpOrders(orders);

        // QoL: auto-select if exactly one order
        if (orders.length === 1) {
          setSelectedErpOrder(orders[0]);
        }
      } catch {
        if (!cancelled) {
          setErpOrderError("Došlo k chybě při načítání ERP zakázek.");
        }
      } finally {
        if (!cancelled) setIsLoadingOrders(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedErp]);

  const handleSelectErpOrder = (order: ErpOrder) => {
    setSelectedErpOrder(order);
    setSkippedErpOrder(false);
  };

  const handleSkipErpOrder = () => {
    setSkippedErpOrder(true);
    setSelectedErpOrder(null);
  };

  // --- Step 3: Create order ---

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createOrder({
        name: formData.name || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        zipcode: formData.zipcode || undefined,
        raynet_id: event.company?.id ?? undefined,
        erp_customer_id: selectedErp?.id ?? undefined,
        source_raynet_event_id: event.id,
        source_erp_order_id: selectedErpOrder?.id ?? undefined,
        notes: event.description || null,
      });
      if (!result.success) {
        if (result.existingOrderId) {
          onOrderCreated(result.existingOrderId);
          return;
        }
        setCreateError(result.error || "Nepodařilo se vytvořit zakázku.");
        return;
      }
      if (result.data?.id) {
        onOrderCreated(result.data.id);
        return;
      }
      setCreateError("Zakázka byla vytvořena, ale ID nebylo vráceno.");
    } catch {
      setCreateError("Došlo k chybě. Zkuste to prosím znovu.");
    } finally {
      setIsCreating(false);
    }
  };

  // --- Step indicator helper ---
  const stepDone = (done: boolean) =>
    done ? "bg-emerald-500 text-emerald-950" : "bg-zinc-700 text-zinc-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-zinc-900 p-6 shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-50">
            Vytvořit zakázku z události
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Raynet info (read-only) */}
        <div className="mb-4 rounded-xl bg-zinc-800 p-3 text-sm">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Raynet zákazník
          </h3>
          <p className="font-medium text-zinc-100">
            {event.company?.name ?? "Neuvedená společnost"}
          </p>
          {prefillAddress && (
            <p className="mt-0.5 text-xs text-zinc-400">{prefillAddress}</p>
          )}
          {prefillPhone && (
            <p className="mt-0.5 text-xs text-zinc-400">Tel: {prefillPhone}</p>
          )}
        </div>

        {/* Step 1: ERP customer pairing */}
        <div className="mb-4 rounded-xl border border-zinc-700 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${stepDone(!!selectedErp)}`}>
              1
            </span>
            <p className="text-sm font-medium text-zinc-200">
              Spárovat s ERP zákazníkem
            </p>
          </div>

          {/* Search input */}
          <div className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doErpSearch(phone);
                }
              }}
              className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500"
              placeholder="+420 ..."
              disabled={isSearching}
            />
            <button
              type="button"
              onClick={() => doErpSearch(phone)}
              disabled={isSearching || phone.trim().length < 6}
              className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            >
              {isSearching ? "Hledám..." : "Vyhledat"}
            </button>
          </div>

          {searchError && (
            <p className="mt-2 text-sm text-red-400">{searchError}</p>
          )}

          {/* ERP candidates */}
          {erpCandidates.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-zinc-400">
                Vyberte ERP zákazníka ({erpCandidates.length})
              </p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-700">
                {erpCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectErp(c)}
                    className={`w-full border-b border-zinc-700 px-3 py-2 text-left last:border-0 transition-colors ${
                      selectedErp?.id === c.id
                        ? "bg-emerald-900/40"
                        : "hover:bg-zinc-800"
                    }`}
                  >
                    <p className="text-sm font-medium text-zinc-100">
                      {c.name || "—"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      Tel: {c.phone || "—"} | ERP #{c.id}
                      {c.address ? ` | ${c.address}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skip option — only after a search has been performed */}
          {hasSearched && !selectedErp && !skippedErp && (
            <button
              type="button"
              onClick={handleSkipErp}
              className="mt-3 text-xs text-zinc-500 underline decoration-zinc-600 hover:text-zinc-300"
            >
              Pokračovat bez ERP párování
            </button>
          )}

          {/* Skip confirmation */}
          {skippedErp && (
            <p className="mt-2 text-xs text-amber-400">
              Zakázka bude vytvořena bez napojení na ERP.
            </p>
          )}

          {/* Selected confirmation */}
          {selectedErp && (
            <p className="mt-2 text-xs text-emerald-400">
              Vybráno: {selectedErp.name} (ERP #{selectedErp.id})
            </p>
          )}
        </div>

        {/* Step 2: ERP order pairing (only when customer is selected, not skipped) */}
        {selectedErp && (
          <div className="mb-4 rounded-xl border border-zinc-700 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${stepDone(!!selectedErpOrder)}`}>
                2
              </span>
              <p className="text-sm font-medium text-zinc-200">
                Spárovat s ERP zakázkou
              </p>
            </div>

            {/* Loading */}
            {isLoadingOrders && (
              <p className="text-sm text-zinc-400">Načítám zakázky z ERP...</p>
            )}

            {/* Error: show message and allow skip so user can proceed without ERP order */}
            {erpOrderError && (
              <div>
                <p className="text-sm text-red-400">{erpOrderError}</p>
                {!skippedErpOrder && (
                  <button
                    type="button"
                    onClick={handleSkipErpOrder}
                    className="mt-2 text-xs text-zinc-500 underline decoration-zinc-600 hover:text-zinc-300"
                  >
                    Pokračovat bez ERP zakázky
                  </button>
                )}
                {skippedErpOrder && (
                  <p className="mt-2 text-xs text-amber-400">
                    Zakázka bude vytvořena bez napojení na ERP zakázku.
                  </p>
                )}
              </div>
            )}

            {/* No orders found */}
            {!isLoadingOrders && !erpOrderError && erpOrders.length === 0 && (
              <div>
                <p className="text-sm text-zinc-400">
                  Zákazník nemá žádné zakázky v ERP.
                </p>
                {!skippedErpOrder && (
                  <button
                    type="button"
                    onClick={handleSkipErpOrder}
                    className="mt-2 text-xs text-zinc-500 underline decoration-zinc-600 hover:text-zinc-300"
                  >
                    Pokračovat bez ERP zakázky
                  </button>
                )}
                {skippedErpOrder && (
                  <p className="mt-2 text-xs text-amber-400">
                    Zakázka bude vytvořena bez napojení na ERP zakázku.
                  </p>
                )}
              </div>
            )}

            {/* Order list (only shown when 2+ orders, since 1 is auto-selected) */}
            {!isLoadingOrders && erpOrders.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-zinc-400">
                  Vyberte ERP zakázku ({erpOrders.length})
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-700">
                  {erpOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => handleSelectErpOrder(o)}
                      className={`w-full border-b border-zinc-700 px-3 py-2.5 text-left last:border-0 transition-colors ${
                        selectedErpOrder?.id === o.id
                          ? "bg-emerald-900/40"
                          : "hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-100">
                          Zakázka #{o.id}
                        </p>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusColor(o.status)}`}>
                          {statusLabel(o.status)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        Vytvořeno: {formatErpDate(o.created_at)}
                        {o.priority !== "medium" && ` | Priorita: ${o.priority}`}
                        {o.order_type !== "order" && ` | Typ: ${o.order_type}`}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-selected single order confirmation */}
            {!isLoadingOrders && erpOrders.length === 1 && selectedErpOrder && (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-emerald-300">
                    Zakázka #{selectedErpOrder.id}
                  </p>
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusColor(selectedErpOrder.status)}`}>
                    {statusLabel(selectedErpOrder.status)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-emerald-400/70">
                  Automaticky vybráno (jediná zakázka zákazníka)
                </p>
              </div>
            )}

            {/* Selected confirmation (multi-order case) */}
            {!isLoadingOrders && erpOrders.length > 1 && selectedErpOrder && (
              <p className="mt-2 text-xs text-emerald-400">
                Vybráno: Zakázka #{selectedErpOrder.id} ({statusLabel(selectedErpOrder.status)}, {formatErpDate(selectedErpOrder.created_at)})
              </p>
            )}

            {/* Skip option for orders */}
            {!isLoadingOrders && erpOrders.length > 0 && !selectedErpOrder && !skippedErpOrder && (
              <button
                type="button"
                onClick={handleSkipErpOrder}
                className="mt-3 text-xs text-zinc-500 underline decoration-zinc-600 hover:text-zinc-300"
              >
                Pokračovat bez ERP zakázky
              </button>
            )}

            {skippedErpOrder && erpOrders.length > 0 && (
              <p className="mt-2 text-xs text-amber-400">
                Zakázka bude vytvořena bez napojení na ERP zakázku.
              </p>
            )}
          </div>
        )}

        {/* Step 3: Customer form + create (only visible after ERP pairing is resolved) */}
        {canCreate && (
          <>
            <div className="mb-4 rounded-xl border border-zinc-700 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-zinc-300">
                  {skippedErp ? "2" : "3"}
                </span>
                <p className="text-sm font-medium text-zinc-200">
                  Údaje zákazníka
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Jméno</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    placeholder="Jméno a příjmení / firma"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Telefon</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    placeholder="+420 ..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Adresa</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    placeholder="Ulice, č.p."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">Město</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    placeholder="Město"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-400">PSČ</label>
                  <input
                    type="text"
                    value={formData.zipcode}
                    onChange={(e) => setFormData((p) => ({ ...p, zipcode: e.target.value }))}
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-50"
                    placeholder="PSČ"
                  />
                </div>
              </div>
            </div>

            {/* Error */}
            {createError && (
              <p className="mb-4 text-sm text-red-400">{createError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {isCreating ? "Vytvářím zakázku..." : "Založit zakázku"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Zrušit
              </button>
            </div>
          </>
        )}

        {/* Cancel only (when form not yet visible) */}
        {!canCreate && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Zrušit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
