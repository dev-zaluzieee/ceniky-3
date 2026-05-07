"use client";

import React from "react";
import type { RowPricePreview } from "@/lib/price-preview-api";

export interface PricePreviewModalProps {
  open: boolean;
  title: string;
  previewState: { status: "loading" } | { status: "error"; error: string } | { status: "success"; data: RowPricePreview } | null;
  currencyFormatter: Intl.NumberFormat;
  onClose: () => void;
}

export default function PricePreviewModal({
  open,
  title,
  previewState,
  currencyFormatter,
  onClose,
}: PricePreviewModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-preview-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h2 id="price-preview-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Náhled ceny
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Zavřít
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {previewState?.status === "loading" ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Počítám cenu...</p>
          ) : null}

          {previewState?.status === "error" ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {previewState.error}
            </div>
          ) : null}

          {previewState?.status === "success" ? (
            <>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-700 dark:bg-zinc-800/80">
                <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Celkem bez DPH</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {currencyFormatter.format(previewState.data.final_price)}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Základ bez DPH</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {currencyFormatter.format(previewState.data.line_base)}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cena za ks bez DPH</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {currencyFormatter.format(previewState.data.unit_price_grid)}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Počet kusů</p>
                  <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {previewState.data.quantity}
                  </p>
                </div>
              </div>

              {previewState.data.surcharges?.length ? (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <p className="border-b border-zinc-200 px-3 py-2 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Příplatky
                  </p>
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {previewState.data.surcharges.map((s) => (
                      <li
                        key={s.code}
                        className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="text-zinc-700 dark:text-zinc-200">
                          {s.label ?? s.code}
                          {s.label && s.label !== s.code ? (
                            <span className="ml-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                              {s.code}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`tabular-nums font-medium ${
                            s.amount >= 0
                              ? "text-zinc-900 dark:text-zinc-50"
                              : "text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {s.amount >= 0 ? "+" : ""}
                          {currencyFormatter.format(s.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
                    <span className="text-zinc-600 dark:text-zinc-300">Celkem příplatky</span>
                    <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-50">
                      {previewState.data.surcharge_total >= 0 ? "+" : ""}
                      {currencyFormatter.format(previewState.data.surcharge_total)}
                    </span>
                  </div>
                </div>
              ) : null}

              {previewState.data.surcharge_warnings?.length ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  {previewState.data.surcharge_warnings[0]}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
