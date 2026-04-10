"use client";

import React from "react";
import type { ProductSwitchLossField } from "@/lib/merge-product-switch";

export interface ProductSwitchLossModalProps {
  open: boolean;
  lostFields: ProductSwitchLossField[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms product switch when some row data cannot be carried over.
 */
export default function ProductSwitchLossModal({
  open,
  lostFields,
  onCancel,
  onConfirm,
}: ProductSwitchLossModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-loss-title"
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40">
          <h2 id="switch-loss-title" className="text-lg font-semibold text-amber-950 dark:text-amber-100">
            Změna produktu — ztráta dat
          </h2>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
            Následující údaje nebudou v novém produktu zachovány (jiný typ sloupce, chybějící pole nebo
            neplatná volba výčtu):
          </p>
        </div>
        <ul className="max-h-48 list-inside list-disc overflow-y-auto px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200">
          {lostFields.map((f) => (
            <li key={f.code} className="mb-1">
              <span className="font-medium">{f.label}</span> ({f.code}) — {f.reason}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Pokračovat a zahodit uvedená data
          </button>
        </div>
      </div>
    </div>
  );
}
