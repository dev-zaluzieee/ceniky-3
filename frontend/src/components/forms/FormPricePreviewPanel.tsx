"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdmfDefaults,
  getFormPricePreview,
  type AdmfDefaults,
  type FormPreviewParameters,
  type FormPreviewResponseData,
} from "@/lib/form-price-preview-api";

interface FormPricePreviewPanelProps {
  open: boolean;
  onClose: () => void;
  /** Live in-memory form_json (schema, product_schemas, data). */
  buildFormJson: () => Record<string, unknown>;
  /** Triggered when the user clicks "Generovat ADMF s těmito parametry". */
  onGenerateAdmf?: (data: FormPreviewResponseData, params: FormPreviewParameters) => void | Promise<void>;
  /** When set, the Generate button is disabled and the reason is shown to the user. */
  generateAdmfDisabledReason?: string;
  currencyFormatter: Intl.NumberFormat;
}

interface PanelOverrides {
  vatRatePercent?: number;
  ovtSlevaBezDph?: number;
  mngSlevaActive?: boolean;
  mngSlevaBezDph?: number;
  montazOverrideBezDph?: number | null;
  bulkSlevaPercent?: number;
}

/**
 * Slide-in panel showing the customer-facing ADMF total for the current form.
 * Defaults come from the office portal; user can override each parameter inline
 * for this preview only (overrides live in component state and are reset on
 * unmount per product call D5).
 */
export default function FormPricePreviewPanel({
  open,
  onClose,
  buildFormJson,
  onGenerateAdmf,
  generateAdmfDisabledReason,
  currencyFormatter,
}: FormPricePreviewPanelProps) {
  const [defaults, setDefaults] = useState<AdmfDefaults | null>(null);
  const [overrides, setOverrides] = useState<PanelOverrides>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FormPreviewResponseData | null>(null);
  const [generating, setGenerating] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Load defaults once when first opened.
  useEffect(() => {
    if (!open || defaults != null) return;
    void (async () => {
      const r = await getAdmfDefaults();
      if (r.success && r.data) {
        setDefaults(r.data);
      } else {
        setError(r.error ?? "Nepodařilo se načíst výchozí hodnoty");
      }
    })();
  }, [open, defaults]);

  const params: FormPreviewParameters | null = useMemo(() => {
    if (!defaults) return null;
    return {
      vatRatePercent: overrides.vatRatePercent ?? defaults.vatRateDefaultPercent,
      ovtSlevaBezDph: overrides.ovtSlevaBezDph ?? defaults.ovtSlevaDefaultBezDph,
      mngSlevaActive: overrides.mngSlevaActive ?? defaults.mngSlevaDefaultActive,
      mngSlevaBezDph: overrides.mngSlevaBezDph ?? defaults.mngSlevaDefaultBezDph,
      // null = let server resolve from tiers; undefined here also passes through (server treats as omit)
      montazOverrideBezDph: overrides.montazOverrideBezDph,
      bulkSlevaPercent: overrides.bulkSlevaPercent ?? defaults.bulkSlevaDefaultPercent,
    };
  }, [defaults, overrides]);

  // Re-fetch the preview whenever inputs change. Debounced so rapid edits don't
  // hammer the server.
  const refresh = useCallback(async () => {
    if (!params) return;
    setLoading(true);
    setError(null);
    const r = await getFormPricePreview({ formJson: buildFormJson(), parameters: params });
    setLoading(false);
    if (r.success && r.data) {
      setResult(r.data);
    } else {
      setError(r.error ?? "Nepodařilo se načíst náhled");
    }
  }, [params, buildFormJson]);

  useEffect(() => {
    if (!open || !params) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void refresh();
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, params, refresh]);

  if (!open) return null;

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl dark:bg-zinc-900">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Náhled ceny</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Zobrazí se zákazníkovi. Výpočet odpovídá tomu, co se stane při vygenerování ADMF.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasOverrides && (
              <button
                type="button"
                onClick={() => setOverrides({})}
                className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
              >
                Reset na výchozí hodnoty
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Zavřít
            </button>
          </div>
        </header>

        <div className="space-y-5 px-5 py-4">
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {!defaults && !error && <p className="text-sm text-zinc-500">Načítám výchozí hodnoty…</p>}

          {defaults && (
            <>
              {!defaults.fromOfficePortal && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Výchozí hodnoty zatím nejsou nakonfigurovány v office portálu — používají se vestavěné fallbacky (12 % DPH, 1339 Kč montáž).
                </div>
              )}

              <ParametersBlock
                defaults={defaults}
                overrides={overrides}
                setOverrides={setOverrides}
                resolvedMontaz={result?.montaz}
              />

              <LinesBlock
                result={result}
                loading={loading}
                currencyFormatter={currencyFormatter}
              />

              <TotalsBlock
                result={result}
                loading={loading}
                currencyFormatter={currencyFormatter}
              />

              <footer className="sticky bottom-0 -mx-5 mt-4 border-t border-zinc-200 bg-white px-5 py-3 dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {generateAdmfDisabledReason ?? "Tlačítko vytvoří ADMF s aktuálními parametry."}
                  </p>
                  <button
                    type="button"
                    disabled={
                      !result ||
                      result.unpriced.length > 0 ||
                      generating ||
                      !!generateAdmfDisabledReason ||
                      !onGenerateAdmf
                    }
                    onClick={async () => {
                      if (!result || !params || !onGenerateAdmf) return;
                      setGenerating(true);
                      try {
                        await onGenerateAdmf(result, params);
                      } finally {
                        setGenerating(false);
                      }
                    }}
                    className="whitespace-nowrap rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      generateAdmfDisabledReason
                        ? generateAdmfDisabledReason
                        : result?.unpriced.length
                          ? "Nejdřív vyřešte všechny řádky bez ceny"
                          : "Vytvoří ADMF s těmito parametry"
                    }
                  >
                    {generating ? "Generuji…" : "Generovat ADMF s těmito parametry"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

function ParametersBlock({
  defaults,
  overrides,
  setOverrides,
  resolvedMontaz,
}: {
  defaults: AdmfDefaults;
  overrides: PanelOverrides;
  setOverrides: React.Dispatch<React.SetStateAction<PanelOverrides>>;
  resolvedMontaz?: FormPreviewResponseData["montaz"];
}) {
  function patch(p: Partial<PanelOverrides>) {
    setOverrides((prev) => ({ ...prev, ...p }));
  }

  const vat = overrides.vatRatePercent ?? defaults.vatRateDefaultPercent;
  const ovt = overrides.ovtSlevaBezDph ?? defaults.ovtSlevaDefaultBezDph;
  const mngActive = overrides.mngSlevaActive ?? defaults.mngSlevaDefaultActive;
  const mng = overrides.mngSlevaBezDph ?? defaults.mngSlevaDefaultBezDph;
  const bulk = overrides.bulkSlevaPercent ?? defaults.bulkSlevaDefaultPercent;

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Parametry</p>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
        <ParamField
          label="Sazba DPH (%)"
          value={String(vat)}
          onChange={(v) => patch({ vatRatePercent: v === "" ? undefined : Number(v) })}
          isOverride={overrides.vatRatePercent !== undefined}
          numberStep="0.01"
        />
        <MontazField
          defaults={defaults}
          override={overrides.montazOverrideBezDph}
          setOverride={(v) => patch({ montazOverrideBezDph: v })}
          resolvedMontaz={resolvedMontaz}
        />
        <ParamField
          label="OVT sleva (bez DPH, Kč)"
          value={String(ovt)}
          onChange={(v) => patch({ ovtSlevaBezDph: v === "" ? undefined : Number(v) })}
          isOverride={overrides.ovtSlevaBezDph !== undefined}
          numberStep="1"
        />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            MNG sleva (bez DPH, Kč)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mngActive}
              onChange={(e) => patch({ mngSlevaActive: e.target.checked })}
              className="rounded border-zinc-300"
              title="Aktivní"
            />
            <input
              type="number"
              value={String(mng)}
              onChange={(e) => patch({ mngSlevaBezDph: e.target.value === "" ? undefined : Number(e.target.value) })}
              min={0}
              step={1}
              disabled={!mngActive}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:bg-zinc-800 dark:text-zinc-50 ${
                overrides.mngSlevaBezDph !== undefined || overrides.mngSlevaActive !== undefined
                  ? "border-blue-300 dark:border-blue-700"
                  : "border-zinc-300 dark:border-zinc-600"
              } ${!mngActive ? "opacity-50" : ""}`}
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <ParamField
            label="Sleva pro všechny produkty (%)"
            value={String(bulk)}
            onChange={(v) =>
              patch({
                bulkSlevaPercent:
                  v === "" ? undefined : Math.min(100, Math.max(0, Number(v))),
              })
            }
            isOverride={overrides.bulkSlevaPercent !== undefined}
            numberStep="1"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Aplikuje se na všechny produktové řádky. 0 % = bez slevy.
          </p>
        </div>
      </div>
    </section>
  );
}

function ParamField({
  label,
  value,
  onChange,
  isOverride,
  numberStep,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isOverride: boolean;
  numberStep: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
        {isOverride && <span className="ml-2 normal-case text-blue-700 dark:text-blue-300">(přepsáno)</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={0}
        step={numberStep}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:bg-zinc-800 dark:text-zinc-50 ${
          isOverride ? "border-blue-300 dark:border-blue-700" : "border-zinc-300 dark:border-zinc-600"
        }`}
      />
    </div>
  );
}

function MontazField({
  defaults,
  override,
  setOverride,
  resolvedMontaz,
}: {
  defaults: AdmfDefaults;
  override: number | null | undefined;
  setOverride: (v: number | null) => void;
  resolvedMontaz?: FormPreviewResponseData["montaz"];
}) {
  const isOverridden = override !== undefined && override !== null;
  const sourceLabel = (() => {
    if (!resolvedMontaz) return null;
    if (resolvedMontaz.source === "override") return "Přepsáno ručně";
    if (resolvedMontaz.source === "tier") return `Pásmo #${resolvedMontaz.tierOrdinal ?? "?"}`;
    return `Pásmo 1 (${defaults.montazFallbackBezDph} Kč)`;
  })();

  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Montáž (bez DPH, Kč)
        {sourceLabel && <span className="ml-2 normal-case text-zinc-500">{sourceLabel}</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          value={isOverridden ? String(override) : resolvedMontaz?.bezDph ?? defaults.montazFallbackBezDph}
          onChange={(e) => setOverride(e.target.value === "" ? null : Number(e.target.value))}
          min={0}
          step={1}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-700 dark:bg-zinc-800 dark:text-zinc-50 ${
            isOverridden ? "border-blue-300 dark:border-blue-700" : "border-zinc-300 dark:border-zinc-600"
          }`}
        />
        {isOverridden && (
          <button
            type="button"
            onClick={() => setOverride(null)}
            className="whitespace-nowrap rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Vrátit k automatickému (z pásem)"
          >
            Auto
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function LinesBlock({
  result,
  loading,
  currencyFormatter,
}: {
  result: FormPreviewResponseData | null;
  loading: boolean;
  currencyFormatter: Intl.NumberFormat;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Řádky</p>
      </div>
      {loading && !result && <p className="px-3 py-3 text-sm text-zinc-500">Počítám…</p>}
      {result && result.lines.length === 0 && result.unpriced.length === 0 && (
        <p className="px-3 py-3 text-sm text-zinc-500">Žádné řádky.</p>
      )}
      {result && result.lines.length > 0 && (
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Produkt</th>
              <th className="px-3 py-2 text-right">Ks</th>
              <th className="px-3 py-2 text-right">Bez DPH</th>
              <th className="px-3 py-2 text-right">S DPH</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {result.lines.map((l) => {
              const lineSDph = Math.round(l.cenaPoSleve * (1 + result.vatRatePercent / 100));
              return (
                <tr key={l.rowKey}>
                  <td className="px-3 py-2">
                    <div className="text-zinc-900 dark:text-zinc-50">{l.produkt}</div>
                    {l.roomName && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{l.roomName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.ks}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {currencyFormatter.format(l.cenaPoSleve)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {currencyFormatter.format(lineSDph)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {result && result.unpriced.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">Nelze spočítat ({result.unpriced.length}):</p>
          <ul className="mt-1 list-disc pl-5">
            {result.unpriced.map((u) => (
              <li key={u.rowKey}>
                {u.roomName ? `${u.roomName} · ` : ""}řádek {u.rowKey}: {u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

function TotalsBlock({
  result,
  loading,
  currencyFormatter,
}: {
  result: FormPreviewResponseData | null;
  loading: boolean;
  currencyFormatter: Intl.NumberFormat;
}) {
  if (!result) {
    return (
      <section className="rounded-lg border border-zinc-200 px-3 py-3 dark:border-zinc-700">
        <p className="text-sm text-zinc-500">{loading ? "Počítám totaly…" : "Nejprve vyplňte řádky."}</p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Kalkulace</p>
      </div>
      <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        <Row label="Produkty bez DPH" value={result.productsBezDph} fmt={currencyFormatter} />
        <Row label="Montáž bez DPH" value={result.montaz.bezDph} fmt={currencyFormatter} />
        {result.ovtSlevaBezDph > 0 && (
          <Row label="OVT sleva" value={-result.ovtSlevaBezDph} fmt={currencyFormatter} negative />
        )}
        {result.mngSlevaActive && result.mngSlevaBezDph > 0 && (
          <Row label="MNG sleva" value={-result.mngSlevaBezDph} fmt={currencyFormatter} negative />
        )}
        <Row label="Celkem bez DPH" value={result.totalBezDph} fmt={currencyFormatter} bold />
        <Row label={`DPH (${result.vatRatePercent} %)`} value={result.vatAmount} fmt={currencyFormatter} />
        <Row label="Celkem s DPH" value={result.totalSDph} fmt={currencyFormatter} bold large />
      </dl>
    </section>
  );
}

function Row({
  label,
  value,
  fmt,
  bold,
  large,
  negative,
}: {
  label: string;
  value: number;
  fmt: Intl.NumberFormat;
  bold?: boolean;
  large?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className={`${bold ? "font-semibold" : "font-normal"} ${large ? "text-base" : "text-sm"} text-zinc-700 dark:text-zinc-200`}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${bold ? "font-semibold" : "font-medium"} ${large ? "text-lg" : "text-sm"} ${
          negative ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-900 dark:text-zinc-50"
        }`}
      >
        {fmt.format(value)}
      </dd>
    </div>
  );
}
