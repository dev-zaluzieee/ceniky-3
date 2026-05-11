/**
 * Admin impact-diff service. Powers POST /api/admin/pricing/impact-diff.
 *
 * Given a product_pricing_id and a set of proposed pricing overrides, walk
 * recent **custom** forms whose rows reference this product and compute, per
 * row, what the price would be under both the live state and the override
 * state. Aggregate per-form deltas + summary stats.
 *
 * Scope decisions:
 *   - **Custom forms only.** ADMFs are intentionally frozen at generation time
 *     (per project memory) and must not be retroactively repriced. Custom
 *     forms are the live representation; their preview price is what would
 *     get baked into the next ADMF generation, so they're the right thing to
 *     diff.
 *   - Per-row fault tolerance mirrors `previewCustomFormPricing`: rows that
 *     fail to price land in the response with `reason` instead of throwing.
 *   - Overrides apply only to the pricing layer (price_affecting_enums,
 *     surcharges, pricing_variants). The row's stored schema (rowSchema) is
 *     a per-form snapshot taken at form-creation time and cannot be replayed
 *     under a different schema; that's a Phase 4 (breakage-check) concern.
 */

import type { Pool } from "pg";
import {
  getProductPricingForResolve,
  getPricingVariantsByProductId,
  type ProductPricingForResolve,
  type PricingVariantRow,
} from "./pricing-forms.service";
import {
  resolveCustomRowPricingCore,
  type CustomRowPricingPreFetched,
} from "./product-extractors";
import type { CalculatePriceOverrides } from "./admin-pricing-preview.service";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface ImpactDiffRequest {
  product_pricing_id: string;
  overrides?: CalculatePriceOverrides;
  filters?: {
    /** ISO date; default = 90 days ago. Only forms created on/after this are considered. */
    since?: string;
    /** Default 200; capped at 500. */
    max_results?: number;
  };
}

export interface ImpactDiffRowEntry {
  room_index: number;
  row_index: number;
  product_label: string;
  dimensions_label: string;
  ks: number;
  /** Line total bez DPH under live pricing rules. Null when the live calc itself fails. */
  old_cena: number | null;
  /** Line total bez DPH under proposed overrides. Null when the override calc fails. */
  new_cena: number | null;
  delta: number | null;
  reason?: string;
}

export interface ImpactDiffFormEntry {
  form_id: number;
  order_id: number | null;
  form_name: string | null;
  created_at: string;
  rows: ImpactDiffRowEntry[];
  old_total: number;
  new_total: number;
  delta: number;
}

export interface ImpactDiffResponse {
  affected: ImpactDiffFormEntry[];
  summary: {
    affected_form_count: number;
    affected_row_count: number;
    /** Aggregate delta in Kč (bez DPH), summed across all rows. */
    total_delta_kc: number;
    /** Rows where the override calc produced an error or null. */
    rows_that_break: number;
    /** Threshold used: |delta / old_cena| > 5%. */
    rows_with_significant_change: number;
  };
  /** True when max_results was hit; admin should narrow the time window. */
  capped: boolean;
}

// ---------------------------------------------------------------------------
// Override merging — specialized to ProductPricingForResolve
// ---------------------------------------------------------------------------

function mergeOverrides(
  liveProduct: ProductPricingForResolve,
  liveVariants: PricingVariantRow[],
  overrides: CalculatePriceOverrides | undefined
): { product: ProductPricingForResolve; variants: PricingVariantRow[] } {
  if (!overrides) return { product: liveProduct, variants: liveVariants };

  const product: ProductPricingForResolve = {
    ...liveProduct,
    price_affecting_enums:
      overrides.product_pricing?.price_affecting_enums ?? liveProduct.price_affecting_enums,
    surcharges:
      overrides.product_pricing?.surcharges !== undefined
        ? overrides.product_pricing.surcharges
        : liveProduct.surcharges,
  };

  let variants = liveVariants;
  const incoming = overrides.pricing_variants ?? [];
  if (incoming.length > 0) {
    const deletedIds = new Set(
      incoming.filter((v) => v._delete && v.id).map((v) => v.id as string)
    );
    const updates = new Map<string, PricingVariantRow>();
    const additions: PricingVariantRow[] = [];

    for (const v of incoming) {
      if (v._delete) continue;
      const row: PricingVariantRow = {
        id: v.id ?? `__draft_${additions.length}__`,
        selector: v.selector,
        dimension_pricing: v.dimension_pricing === undefined ? null : v.dimension_pricing,
        surcharge_only: v.surcharge_only === true,
      };
      if (v.id) updates.set(v.id, row);
      else additions.push(row);
    }

    variants = liveVariants
      .filter((existing) => !deletedIds.has(existing.id))
      .map((existing) => updates.get(existing.id) ?? existing);
    for (const [id, row] of updates.entries()) {
      if (!liveVariants.some((v) => v.id === id)) variants.push(row);
    }
    variants.push(...additions);
  }

  return { product, variants };
}

// ---------------------------------------------------------------------------
// Form fetch — custom forms touching this product within the time window
// ---------------------------------------------------------------------------

interface CustomFormRow {
  id: number;
  order_id: number | null;
  form_json: Record<string, unknown> & { name?: string };
  created_at: string;
}

async function fetchCustomFormsTouchingProduct(
  mainPool: Pool,
  productPricingId: string,
  since: Date,
  limit: number
): Promise<CustomFormRow[]> {
  // Use jsonb @> containment to push the filter to Postgres. The GIN index
  // on form_json (jsonb_path_ops, see schema/012) makes this fast even on
  // large `forms` tables. The containment matches forms where data.rooms[]
  // includes a room whose rows[] includes a row with this product_pricing_id.
  const containmentNeedle = JSON.stringify({
    data: {
      rooms: [
        {
          rows: [{ product_pricing_id: productPricingId }],
        },
      ],
    },
  });

  const result = await mainPool.query(
    `SELECT id, order_id, form_json, created_at
     FROM forms
     WHERE form_type = 'custom'
       AND deleted_at IS NULL
       AND created_at >= $1
       AND form_json @> $2::jsonb
     ORDER BY created_at DESC
     LIMIT $3`,
    [since.toISOString(), containmentNeedle, limit]
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    order_id: r.order_id == null ? null : Number(r.order_id),
    form_json:
      r.form_json && typeof r.form_json === "object"
        ? (r.form_json as Record<string, unknown> & { name?: string })
        : {},
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

// ---------------------------------------------------------------------------
// Per-row pricing helpers
// ---------------------------------------------------------------------------

function flattenRowForExtract(row: Record<string, unknown>): Record<string, unknown> {
  const values = row.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    const v = values as Record<string, unknown>;
    const out: Record<string, unknown> = { ...v };
    if (row.linkGroupId !== undefined) out.linkGroupId = row.linkGroupId;
    return out;
  }
  return row;
}

function findRowSchema(
  formJson: Record<string, unknown>,
  productPricingId: string
): Record<string, unknown> | null {
  const productSchemas = formJson.product_schemas as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (productSchemas && typeof productSchemas === "object") {
    const direct = productSchemas[productPricingId];
    if (direct) return direct;
  }
  const top = formJson.schema as Record<string, unknown> | undefined;
  if (top && (top._product_pricing_id as string | undefined) === productPricingId) return top;
  return null;
}

async function priceRow(args: {
  pricingPool: Pool;
  rowSchema: Record<string, unknown>;
  flatRow: Record<string, unknown>;
  productPricingId: string;
  preFetched?: CustomRowPricingPreFetched;
}): Promise<{ ok: true; cena: number; produkt: string; dimStr: string; ks: number } | { ok: false; reason: string }> {
  try {
    const r = await resolveCustomRowPricingCore(args);
    return { ok: true, cena: r.cena, produkt: r.produkt, dimStr: r.dimStr, ks: r.ks };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Pricing failed" };
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const SIGNIFICANT_CHANGE_THRESHOLD = 0.05; // 5%

export async function runImpactDiff(
  mainPool: Pool,
  pricingPool: Pool,
  req: ImpactDiffRequest
): Promise<ImpactDiffResponse> {
  // Resolve effective (live + override) pricing inputs once for the whole run.
  const liveProduct = await getProductPricingForResolve(pricingPool, req.product_pricing_id);
  if (!liveProduct) {
    throw Object.assign(new Error(`Product pricing not found: ${req.product_pricing_id}`), {
      code: "PRODUCT_PRICING_NOT_FOUND",
    });
  }
  const liveVariants = await getPricingVariantsByProductId(pricingPool, req.product_pricing_id);
  const merged = mergeOverrides(liveProduct, liveVariants, req.overrides);

  const livePreFetched: CustomRowPricingPreFetched = {
    product: liveProduct,
    variants: liveVariants,
  };
  const overridePreFetched: CustomRowPricingPreFetched | undefined = req.overrides
    ? { product: merged.product, variants: merged.variants }
    : undefined;

  // Filters
  const sinceMs = req.filters?.since ? Date.parse(req.filters.since) : NaN;
  const since = Number.isFinite(sinceMs)
    ? new Date(sinceMs)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const requestedLimit = Math.max(
    1,
    Math.min(500, Math.round(Number(req.filters?.max_results ?? 200)) || 200)
  );

  const forms = await fetchCustomFormsTouchingProduct(
    mainPool,
    req.product_pricing_id,
    since,
    requestedLimit + 1 // fetch one extra so we know if we capped
  );
  const capped = forms.length > requestedLimit;
  const consideredForms = capped ? forms.slice(0, requestedLimit) : forms;

  const affected: ImpactDiffFormEntry[] = [];
  let totalDelta = 0;
  let totalRows = 0;
  let rowsThatBreak = 0;
  let rowsSignificant = 0;

  for (const form of consideredForms) {
    const rooms =
      (form.form_json.data as { rooms?: Array<{ name?: string; rows?: Array<Record<string, unknown>> }> } | undefined)
        ?.rooms ?? [];
    const rowsOut: ImpactDiffRowEntry[] = [];
    let formOldTotal = 0;
    let formNewTotal = 0;

    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const rows = rooms[roomIndex]?.rows;
      if (!Array.isArray(rows)) continue;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const rawRow = rows[rowIndex];
        const flatRow = flattenRowForExtract(rawRow);
        const rowPid =
          (rawRow.product_pricing_id as string | undefined) ||
          (typeof flatRow.product_pricing_id === "string" ? flatRow.product_pricing_id : undefined);
        if (rowPid !== req.product_pricing_id) continue;

        const rowSchema = findRowSchema(form.form_json, req.product_pricing_id);
        if (!rowSchema) {
          rowsOut.push({
            room_index: roomIndex,
            row_index: rowIndex,
            product_label: "—",
            dimensions_label: "—",
            ks: 0,
            old_cena: null,
            new_cena: null,
            delta: null,
            reason: "Chybí schéma produktu ve form_json (product_schemas).",
          });
          rowsThatBreak++;
          continue;
        }

        const [oldRes, newRes] = await Promise.all([
          priceRow({
            pricingPool,
            rowSchema,
            flatRow,
            productPricingId: req.product_pricing_id,
            preFetched: livePreFetched,
          }),
          overridePreFetched
            ? priceRow({
                pricingPool,
                rowSchema,
                flatRow,
                productPricingId: req.product_pricing_id,
                preFetched: overridePreFetched,
              })
            : Promise.resolve(
                { ok: true as const, cena: 0, produkt: "", dimStr: "", ks: 0 } // placeholder when no overrides
              ),
        ]);

        const oldCena = oldRes.ok ? oldRes.cena : null;
        const newCena = req.overrides
          ? newRes.ok
            ? newRes.cena
            : null
          : oldCena; // no overrides → new == old
        const delta = oldCena != null && newCena != null ? newCena - oldCena : null;

        const labelSource = oldRes.ok ? oldRes : newRes.ok ? newRes : null;
        const productLabel = labelSource?.produkt ?? "—";
        const dimensionsLabel = labelSource?.dimStr ?? "—";
        const ks = labelSource?.ks ?? 0;

        rowsOut.push({
          room_index: roomIndex,
          row_index: rowIndex,
          product_label: productLabel,
          dimensions_label: dimensionsLabel,
          ks,
          old_cena: oldCena,
          new_cena: newCena,
          delta,
          ...(oldRes.ok ? {} : { reason: oldRes.reason }),
          ...(req.overrides && !newRes.ok ? { reason: newRes.reason } : {}),
        });

        if (oldCena != null) formOldTotal += oldCena;
        if (newCena != null) formNewTotal += newCena;
        totalRows++;
        if (delta == null || newCena == null) rowsThatBreak++;
        if (
          oldCena != null &&
          delta != null &&
          oldCena !== 0 &&
          Math.abs(delta / oldCena) > SIGNIFICANT_CHANGE_THRESHOLD
        ) {
          rowsSignificant++;
        }
      }
    }

    if (rowsOut.length === 0) continue; // shouldn't happen given the SQL filter, but guard anyway

    const formDelta = formNewTotal - formOldTotal;
    affected.push({
      form_id: form.id,
      order_id: form.order_id,
      form_name: typeof form.form_json.name === "string" ? form.form_json.name : null,
      created_at: form.created_at,
      rows: rowsOut,
      old_total: formOldTotal,
      new_total: formNewTotal,
      delta: formDelta,
    });
    totalDelta += formDelta;
  }

  return {
    affected,
    summary: {
      affected_form_count: affected.length,
      affected_row_count: totalRows,
      total_delta_kc: totalDelta,
      rows_that_break: rowsThatBreak,
      rows_with_significant_change: rowsSignificant,
    },
    capped,
  };
}
