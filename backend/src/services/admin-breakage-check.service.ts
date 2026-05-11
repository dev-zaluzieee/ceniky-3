/**
 * Admin breakage-check service. Powers POST /api/admin/forms/breakage-check.
 *
 * Form-structure equivalent of impact-diff. Given a product_code and a
 * proposed validated_payload (the schema the admin is about to save), find
 * recent custom forms whose rows reference any pricing record sharing this
 * product_code and report which rows would fail validation under the new
 * schema.
 *
 * Failure kinds:
 *   - `missing_required`     : payload's `required_properties` lists a field
 *                              that's empty/missing in this row's `values`
 *   - `enum_value_removed`   : row holds a value for an enum that's no longer
 *                              in the payload's enum list (possibly because
 *                              admin marked it `we_sell=false`)
 *   - `type_mismatch`        : value's runtime type doesn't fit the property's
 *                              `DataType` (numeric expected, string present, etc.)
 *
 * Out of scope for v1: dimension out-of-range checks (size_limit_variant
 * lives on the pricing side and isn't part of the proposed payload). Add in
 * a follow-up if admins ask.
 */

import type { Pool } from "pg";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface PayloadProperty {
  ID?: string;
  Code: string;
  Name?: string;
  DataType?: "text" | "numeric" | "boolean" | "enum" | "textarea" | "link" | string;
}

export interface PayloadEnumValue {
  code: string;
  name?: string;
  active?: boolean;
}

export interface ProposedPayload {
  product_code: string;
  required_properties?: string[];
  zahlavi?: { Properties?: PayloadProperty[] };
  form_body?: { Properties?: PayloadProperty[] };
  zapati?: { Properties?: PayloadProperty[] };
  enums?: Record<string, { default?: PayloadEnumValue[] }>;
  /** Other fields we don't validate (price_affecting_enums, surcharge_properties, etc.) */
  [k: string]: unknown;
}

export interface BreakageCheckRequest {
  product_code: string;
  proposed_payload: ProposedPayload;
  filters?: {
    /** ISO date; default = 90 days ago. */
    since?: string;
    /** Default 200; capped at 500. */
    max_results?: number;
  };
}

export type FailureReason =
  | "missing_required"
  | "enum_value_removed"
  | "type_mismatch";

export interface FailureEntry {
  field: string;
  reason: FailureReason;
  detail: string;
  /** Current value as string for diagnostics. */
  current_value?: string;
}

export interface BreakageCheckRowFailures {
  room_index: number;
  row_index: number;
  product_pricing_id: string;
  failures: FailureEntry[];
}

export interface BreakageCheckFormEntry {
  form_id: number;
  order_id: number | null;
  form_name: string | null;
  created_at: string;
  rows: BreakageCheckRowFailures[];
}

export interface BreakageCheckResponse {
  would_fail: BreakageCheckFormEntry[];
  summary: {
    affected_form_count: number;
    affected_row_count: number;
    total_failures: number;
    by_reason: Record<FailureReason, number>;
  };
  capped: boolean;
  /** product_pricing_ids resolved from product_code; useful for debugging. */
  resolved_pricing_ids: string[];
}

// ---------------------------------------------------------------------------
// Schema validator — pure, no I/O
// ---------------------------------------------------------------------------

function getAllProperties(payload: ProposedPayload): PayloadProperty[] {
  const out: PayloadProperty[] = [];
  for (const sec of [payload.zahlavi, payload.form_body, payload.zapati]) {
    if (sec?.Properties && Array.isArray(sec.Properties)) {
      out.push(...(sec.Properties as PayloadProperty[]));
    }
  }
  return out;
}

function getActiveEnumCodes(payload: ProposedPayload, enumCode: string): Set<string> {
  const entry = payload.enums?.[enumCode];
  if (!entry?.default || !Array.isArray(entry.default)) return new Set();
  return new Set(
    entry.default.filter((v) => v.active !== false).map((v) => String(v.code))
  );
}

/**
 * Validate a single row's `values` map against the proposed payload. Pure.
 */
export function validateRowAgainstPayload(
  values: Record<string, unknown>,
  payload: ProposedPayload
): FailureEntry[] {
  const failures: FailureEntry[] = [];
  const allProps = getAllProperties(payload);
  const propsByCode = new Map(allProps.map((p) => [p.Code, p]));
  const required = new Set(payload.required_properties ?? []);

  // missing_required: scan required list (not just defined props). A field
  // could be marked required but removed from the payload's properties — the
  // row value would be silently dropped on next render; flag it.
  for (const code of required) {
    const v = values[code];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      failures.push({
        field: code,
        reason: "missing_required",
        detail: `Pole "${code}" je nově povinné, ale v řádku není vyplněno.`,
      });
    }
  }

  // For each value the row carries, check enum membership + type.
  for (const [code, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    if (code === "linkGroupId") continue; // internal field, not a property

    const prop = propsByCode.get(code);
    if (!prop) continue; // property removed entirely; nothing to validate against

    const dt = prop.DataType ?? "";

    // type_mismatch
    if (dt === "numeric") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        failures.push({
          field: code,
          reason: "type_mismatch",
          detail: `Pole "${code}" má nově typ numeric, ale hodnota není číslo.`,
          current_value: String(raw),
        });
        continue;
      }
    } else if (dt === "boolean" || dt === "link") {
      if (typeof raw !== "boolean") {
        // strings "true"/"false" are tolerated since the form can produce them
        const s = String(raw).toLowerCase().trim();
        if (s !== "true" && s !== "false") {
          failures.push({
            field: code,
            reason: "type_mismatch",
            detail: `Pole "${code}" má nově typ boolean, ale hodnota není true/false.`,
            current_value: String(raw),
          });
          continue;
        }
      }
    } else if (dt === "enum") {
      const allowed = getActiveEnumCodes(payload, code);
      const valStr = String(raw).trim();
      if (allowed.size > 0 && !allowed.has(valStr)) {
        failures.push({
          field: code,
          reason: "enum_value_removed",
          detail: `Hodnota "${valStr}" pro pole "${code}" už v ceníku není (možná byla odznačena we_sell).`,
          current_value: valStr,
        });
        continue;
      }
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
// DB lookups
// ---------------------------------------------------------------------------

async function resolveProductPricingIdsByCode(
  pricingPool: Pool,
  productCode: string
): Promise<string[]> {
  const { rows } = await pricingPool.query(
    `SELECT id FROM product_pricing WHERE product_code = $1`,
    [productCode]
  );
  return rows.map((r) => String(r.id));
}

interface CustomFormRow {
  id: number;
  order_id: number | null;
  form_json: Record<string, unknown> & { name?: string };
  created_at: string;
}

async function fetchCustomFormsTouchingAnyOf(
  mainPool: Pool,
  productPricingIds: string[],
  since: Date,
  limit: number
): Promise<CustomFormRow[]> {
  if (productPricingIds.length === 0) return [];

  // Build N containment needles, one per pricing id, OR them together. Each
  // needle is a structural path that the GIN(jsonb_path_ops) index can match.
  const placeholders: string[] = [];
  const params: unknown[] = [since.toISOString()];
  productPricingIds.forEach((id, i) => {
    placeholders.push(`form_json @> $${i + 2}::jsonb`);
    params.push(
      JSON.stringify({
        data: {
          rooms: [{ rows: [{ product_pricing_id: id }] }],
        },
      })
    );
  });
  params.push(limit);

  const sql = `
    SELECT id, order_id, form_json, created_at
    FROM forms
    WHERE form_type = 'custom'
      AND deleted_at IS NULL
      AND created_at >= $1
      AND (${placeholders.join(" OR ")})
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `;

  const result = await mainPool.query(sql, params);
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
// Main entry
// ---------------------------------------------------------------------------

function flattenRowValues(row: Record<string, unknown>): Record<string, unknown> {
  const values = row.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    return values as Record<string, unknown>;
  }
  return row;
}

export async function runBreakageCheck(
  mainPool: Pool,
  pricingPool: Pool,
  req: BreakageCheckRequest
): Promise<BreakageCheckResponse> {
  const productCode = req.product_code.trim();
  if (!productCode) {
    throw Object.assign(new Error("product_code is required"), { code: "BAD_INPUT" });
  }
  if (!req.proposed_payload || typeof req.proposed_payload !== "object") {
    throw Object.assign(new Error("proposed_payload is required"), { code: "BAD_INPUT" });
  }

  const pricingIds = await resolveProductPricingIdsByCode(pricingPool, productCode);
  const idsSet = new Set(pricingIds);

  // Filters
  const sinceMs = req.filters?.since ? Date.parse(req.filters.since) : NaN;
  const since = Number.isFinite(sinceMs)
    ? new Date(sinceMs)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const requestedLimit = Math.max(
    1,
    Math.min(500, Math.round(Number(req.filters?.max_results ?? 200)) || 200)
  );

  if (pricingIds.length === 0) {
    return {
      would_fail: [],
      summary: {
        affected_form_count: 0,
        affected_row_count: 0,
        total_failures: 0,
        by_reason: { missing_required: 0, enum_value_removed: 0, type_mismatch: 0 },
      },
      capped: false,
      resolved_pricing_ids: [],
    };
  }

  const forms = await fetchCustomFormsTouchingAnyOf(
    mainPool,
    pricingIds,
    since,
    requestedLimit + 1
  );
  const capped = forms.length > requestedLimit;
  const considered = capped ? forms.slice(0, requestedLimit) : forms;

  const wouldFail: BreakageCheckFormEntry[] = [];
  const byReason: Record<FailureReason, number> = {
    missing_required: 0,
    enum_value_removed: 0,
    type_mismatch: 0,
  };
  let totalRowsFailed = 0;
  let totalFailures = 0;

  for (const form of considered) {
    const rooms =
      (form.form_json.data as { rooms?: Array<{ rows?: Array<Record<string, unknown>> }> } | undefined)?.rooms ?? [];
    const formRowFailures: BreakageCheckRowFailures[] = [];

    for (let roomIndex = 0; roomIndex < rooms.length; roomIndex++) {
      const rows = rooms[roomIndex]?.rows;
      if (!Array.isArray(rows)) continue;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const rawRow = rows[rowIndex];
        const flatVals = flattenRowValues(rawRow);
        const rowPid =
          (rawRow.product_pricing_id as string | undefined) ||
          (typeof flatVals.product_pricing_id === "string"
            ? flatVals.product_pricing_id
            : undefined);
        if (!rowPid || !idsSet.has(rowPid)) continue;

        const failures = validateRowAgainstPayload(flatVals, req.proposed_payload);
        if (failures.length === 0) continue;

        formRowFailures.push({
          room_index: roomIndex,
          row_index: rowIndex,
          product_pricing_id: rowPid,
          failures,
        });
        totalRowsFailed++;
        totalFailures += failures.length;
        for (const f of failures) byReason[f.reason]++;
      }
    }

    if (formRowFailures.length > 0) {
      wouldFail.push({
        form_id: form.id,
        order_id: form.order_id,
        form_name: typeof form.form_json.name === "string" ? form.form_json.name : null,
        created_at: form.created_at,
        rows: formRowFailures,
      });
    }
  }

  return {
    would_fail: wouldFail,
    summary: {
      affected_form_count: wouldFail.length,
      affected_row_count: totalRowsFailed,
      total_failures: totalFailures,
      by_reason: byReason,
    },
    capped,
    resolved_pricing_ids: pricingIds,
  };
}
