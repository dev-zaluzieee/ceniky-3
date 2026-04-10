"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getPricingFormById,
  listPricingForms,
  type PricingFormDetail,
  type PricingFormListItem,
} from "@/lib/pricing-forms-api";

export interface ProductPickerModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Called after a successful catalog fetch for the chosen product */
  onPicked: (detail: PricingFormDetail) => void;
}

/**
 * Modal: search/list OVT pricing products and pick one (loads full `ovt_export_json` on confirm).
 */
export default function ProductPickerModal({ open, title, onClose, onPicked }: ProductPickerModalProps) {
  const [list, setList] = useState<PricingFormListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || list !== null) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    listPricingForms({}).then((res) => {
      if (cancelled) return;
      setListLoading(false);
      if (res.success && res.data) setList(res.data);
      else setListError(res.error ?? "Nepodařilo se načíst katalog.");
    });
    return () => {
      cancelled = true;
    };
  }, [open, list]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPickingId(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.display_name.toLowerCase().includes(q) ||
        f.product_code.toLowerCase().includes(q) ||
        f.manufacturer.toLowerCase().includes(q)
    );
  }, [list, search]);

  const handlePick = async (id: string) => {
    setPickingId(id);
    try {
      const res = await getPricingFormById(id);
      if (!res.success || !res.data) {
        setListError(res.error ?? "Nepodařilo se načíst detail produktu.");
        return;
      }
      onPicked(res.data);
      onClose();
    } finally {
      setPickingId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-picker-title"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 id="product-picker-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat podle názvu, kódu, výrobce…"
            className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {listLoading && <p className="p-4 text-sm text-zinc-500">Načítám katalog…</p>}
          {listError && <p className="p-4 text-sm text-red-600">{listError}</p>}
          {!listLoading &&
            list &&
            filtered.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={pickingId !== null}
                onClick={() => handlePick(f.id)}
                className="mb-1 flex w-full flex-col items-start rounded-lg border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50 dark:hover:bg-primary/10"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{f.display_name}</span>
                <span className="text-xs text-zinc-500">
                  {f.manufacturer} · {f.product_code}
                </span>
                {pickingId === f.id && <span className="mt-1 text-xs text-primary">Načítám…</span>}
              </button>
            ))}
          {!listLoading && list && filtered.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">Žádný výsledek.</p>
          )}
        </div>
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
