/**
 * ERP export pipeline — maps ADMF form_json to ERP API payloads
 * and orchestrates the 3-write logging flow (PENDING → SENDING → SUCCESS/FAILED).
 *
 * Live API calls: PUT order (status + column_values), POST comment.
 * Products: payload built and logged but HTTP call skipped (monitoring only).
 */

import { Pool } from "pg";
import * as erpExportLogsQueries from "../queries/erp-export-logs.queries";
import * as formsQueries from "../queries/forms.queries";
import * as ordersQueries from "../queries/orders.queries";
import {
  ErpExportWarning,
  ErpExportErrorCode,
  ErpOrderUpdatePayload,
  ErpProductPayload,
  ErpCommentPayload,
} from "../types/erp-export.types";
import { BadRequestError, InternalServerError } from "../utils/errors";
import {
  computeAdmfCelkemBezDph,
  computeAdmfCelkemSDph,
  effectiveMontazBezDph,
} from "../utils/admf-order-totals";

// ── Enum mapping tables ──────────────────────────────────────────

const ZALOHA_TO_ERP_SLUG: Record<string, string> = {
  "Hotově": "hotove",
  "Terminálem": "terminalem",
  "QR": "qr-kod",
  "převodem": "prevodem",
  "Fakturou": "prevodem", // best guess — flagged as OPEN in mapping
};

const VAT_TO_ERP: Record<number, string> = {
  0: "0",
  12: "0.12",
  21: "0.21",
};

// ── Payload builders ─────────────────────────────────────────────

interface ErpMappingResult {
  orderPayload: ErpOrderUpdatePayload;
  productsPayload: { products: ErpProductPayload[] };
  commentPayload: ErpCommentPayload | null;
  warnings: ErpExportWarning[];
}

/**
 * Build all ERP payloads from ADMF form_json.
 * Also resolves manufacturer from linked custom forms if available.
 */
export function buildErpPayloads(
  formJson: Record<string, any>,
  manufacturer: string | undefined
): ErpMappingResult {
  const warnings: ErpExportWarning[] = [];
  const columnValues: Record<string, unknown> = {};

  const vatRate = formJson.vatRate ?? 12;
  const totalBezDph = computeAdmfCelkemBezDph(formJson);
  const totalSDph = computeAdmfCelkemSDph(formJson);

  // ── Finance column_values ──

  // prodejni_cena_s_dph + prodejni_cena_bez_dph
  columnValues.prodejni_cena_s_dph = totalSDph;
  columnValues.prodejni_cena_bez_dph = totalBezDph;

  // dph
  const erpDph = VAT_TO_ERP[vatRate];
  if (erpDph !== undefined) {
    columnValues.dph = erpDph;
  } else {
    warnings.push({
      code: "ENUM_MISMATCH",
      field: "vatRate",
      reason: `Value "${vatRate}" has no ERP mapping (expected 0, 12, or 21)`,
    });
  }

  // vyse_zalohy
  if (formJson.zalohovaFaktura != null && formJson.zalohovaFaktura > 0) {
    columnValues.vyse_zalohy = formJson.zalohovaFaktura;
  }

  // vyse_doplatku
  const doplatek = Math.max(0, totalSDph - (formJson.zalohovaFaktura ?? 0));
  columnValues.vyse_doplatku = doplatek;

  // druh_platby
  if (formJson.zalohaZaplacena) {
    const erpSlug = ZALOHA_TO_ERP_SLUG[formJson.zalohaZaplacena];
    if (erpSlug) {
      columnValues.druh_platby = erpSlug;
    } else {
      warnings.push({
        code: "ENUM_MISMATCH",
        field: "zalohaZaplacena",
        reason: `Value "${formJson.zalohaZaplacena}" has no ERP slug mapping`,
      });
    }
  }

  // cena_za_montaz_s_dph (effective montáž = auto default nebo vlastní částka)
  const montazBezDph = effectiveMontazBezDph(formJson);
  if (montazBezDph > 0) {
    columnValues.cena_za_montaz_s_dph = Math.round(montazBezDph * (1 + vatRate / 100));
  }

  // ── Order update payload ──
  const orderPayload: ErpOrderUpdatePayload = {
    status: "zamereni",
    final_value: totalSDph,
    column_values: columnValues,
  };

  // ── Products payload (monitoring only — not sent to ERP yet) ──
  const rows: any[] = formJson.productRows || [];
  const products: ErpProductPayload[] = rows
    .filter((r: any) => r.produkt && r.produkt.trim() !== "")
    .map((r: any) => {
      const product: ErpProductPayload = {
        nazev: r.produkt,
        ks: r.ks ?? 1,
        cena_bez_dph: r.cenaPoSleve ?? 0,
        cena_s_dph: Math.round((r.cenaPoSleve ?? 0) * (1 + vatRate / 100)),
      };
      if (manufacturer) {
        product.vyrobce = manufacturer;
      }
      return product;
    });

  if (!manufacturer && products.length > 0) {
    warnings.push({
      code: "FIELD_EMPTY",
      field: "vyrobce",
      reason: "Manufacturer not available on form schema (_product_manufacturer missing). Products logged without vyrobce.",
    });
  }

  warnings.push({
    code: "PRODUCTS_SKIPPED",
    field: "products",
    reason: "Products payload built for monitoring but HTTP call skipped (not yet enabled).",
  });

  // ── Comment payload ──
  const vyrobaText = (formJson.poznamkyVyroba ?? "").trim();
  const montazText = (formJson.poznamkyMontaz ?? "").trim();
  const datum = formJson.datum ?? new Date().toISOString().slice(0, 10);
  const commentParts = [`Export z ADMF (${datum}):`];
  if (vyrobaText) commentParts.push(`Výroba: ${vyrobaText}`);
  if (montazText) commentParts.push(`Montáž: ${montazText}`);

  const commentPayload: ErpCommentPayload | null =
    commentParts.length > 1 ? { body: commentParts.join("\n") } : null;

  return { orderPayload, productsPayload: { products }, commentPayload, warnings };
}

// ── ERP HTTP calls ───────────────────────────────────────────────

export function getErpConfig(): { apiEndpoint: string; bearerToken: string } {
  const apiEndpoint = process.env.ERP_API_ENDPOINT;
  const bearerToken = process.env.ERP_BEARER_TOKEN;
  if (!apiEndpoint || !bearerToken) {
    throw Object.assign(
      new InternalServerError("ERP API is not configured (missing ERP_API_ENDPOINT or ERP_BEARER_TOKEN)"),
      { errorCode: "ERP_CONFIG_MISSING" as ErpExportErrorCode }
    );
  }
  return { apiEndpoint: apiEndpoint.replace(/\/$/, ""), bearerToken };
}

export async function erpFetch(
  url: string,
  bearerToken: string,
  method: string,
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  let respBody: Record<string, unknown>;
  try {
    respBody = (await response.json()) as Record<string, unknown>;
  } catch {
    respBody = { rawText: await response.text().catch(() => "unreadable") };
  }

  return { status: response.status, body: respBody };
}

export function classifyErpHttpError(status: number): ErpExportErrorCode {
  if (status === 401 || status === 403) return "ERP_AUTH_FAILED";
  if (status === 404) return "ERP_ORDER_NOT_FOUND";
  if (status === 422) return "ERP_VALIDATION_ERROR";
  if (status === 423) return "ERP_ORDER_LOCKED";
  if (status >= 400 && status < 500) return "ERP_VALIDATION_ERROR";
  if (status >= 500) return "ERP_SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

// ── Main pipeline ────────────────────────────────────────────────

export interface ErpExportResult {
  logId: number;
  exportedAt: Date;
  testMode: boolean;
  warnings: ErpExportWarning[];
}

/**
 * Full ERP export pipeline with 3-write logging.
 * Sends: PUT order (status + column_values), POST comment.
 * Products: built and logged but HTTP call skipped.
 */
export async function exportFormToErp(
  pool: Pool,
  formId: number,
  userId: string,
  testMode: boolean,
  exportBatchId?: string
): Promise<ErpExportResult> {
  // ── Step 0: Load form + order, resolve ERP order ID ──
  const form = await formsQueries.getFormById(pool, formId, userId);
  if (!form) throw new BadRequestError("Form not found", "FORM_NOT_FOUND");
  if (form.form_type !== "admf") throw new BadRequestError("Only ADMF forms can be exported to ERP");

  const orderId = form.order_id;
  if (!orderId) throw new BadRequestError("Form is not linked to an order");

  const order = await ordersQueries.getOrderById(pool, orderId, userId);
  if (!order) throw new BadRequestError("Order not found", "ORDER_NOT_FOUND");

  const erpOrderId = order.source_erp_order_id;
  if (!erpOrderId) {
    throw new BadRequestError(
      "Order has no linked ERP order (source_erp_order_id is empty)",
      "MISSING_ERP_ORDER_ID"
    );
  }

  // ── Resolve manufacturer from linked custom forms ──
  let manufacturer: string | undefined;
  const sourceFormIds: number[] = form.form_json?.source_form_ids ?? [];
  if (sourceFormIds.length > 0) {
    try {
      const sourceForm = await formsQueries.getFormById(pool, sourceFormIds[0], userId);
      if (sourceForm?.form_json?.schema?._product_manufacturer) {
        manufacturer = sourceForm.form_json.schema._product_manufacturer;
      }
    } catch {
      // Non-critical — continue without manufacturer
    }
  }

  // ── Write 1: CREATE log (PENDING) ──
  const startTime = Date.now();
  const logId = await erpExportLogsQueries.createErpExportLog(pool, {
    form_id: formId,
    order_id: orderId,
    erp_order_id: erpOrderId,
    user_id: userId,
    export_batch_id: exportBatchId,
    test_mode: testMode,
  });

  try {
    // ── Build payloads ──
    const { orderPayload, productsPayload, commentPayload, warnings } =
      buildErpPayloads(form.form_json, manufacturer);

    // ── Write 2: UPDATE log (SENDING) — store all payloads + warnings ──
    await erpExportLogsQueries.updateErpExportLog(pool, logId, {
      status: "SENDING",
      request_payload: {
        order_update: orderPayload,
        products: productsPayload.products,
        comment: commentPayload?.body ?? null,
      } as unknown as Record<string, unknown>,
      warnings,
    });

    if (testMode) {
      // ── Test mode: skip all API calls, log success ──
      const now = new Date();
      await erpExportLogsQueries.updateErpExportLog(pool, logId, {
        status: "SUCCESS",
        response_status: 0,
        response_body: { testMode: true, message: "Skipped — test mode" },
        duration_ms: Date.now() - startTime,
        completed_at: now,
      });
      return { logId, exportedAt: now, testMode: true, warnings };
    }

    // ── Step 3a: PUT order update ──
    const { apiEndpoint, bearerToken } = getErpConfig();
    let orderResult: { status: number; body: Record<string, unknown> };
    try {
      orderResult = await erpFetch(
        `${apiEndpoint}/orders/${erpOrderId}`,
        bearerToken,
        "PUT",
        orderPayload
      );
    } catch (error: any) {
      const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";
      const errorCode: ErpExportErrorCode = isTimeout ? "ERP_TIMEOUT" : "UNKNOWN_ERROR";
      await erpExportLogsQueries.updateErpExportLog(pool, logId, {
        status: "FAILED",
        error_message: error.message,
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
        completed_at: new Date(),
      });
      throw new InternalServerError(
        isTimeout ? "ERP API request timed out" : `ERP API call failed: ${error.message}`
      );
    }

    if (orderResult.status < 200 || orderResult.status >= 300) {
      const errorCode = classifyErpHttpError(orderResult.status);
      const errorMsg = `ERP returned HTTP ${orderResult.status}`;
      await erpExportLogsQueries.updateErpExportLog(pool, logId, {
        status: "FAILED",
        response_status: orderResult.status,
        response_body: orderResult.body,
        error_message: errorMsg,
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
        completed_at: new Date(),
      });
      throw new InternalServerError(errorMsg);
    }

    // ── Step 3b: POST comment (non-critical) ──
    let commentWarning: ErpExportWarning | null = null;
    if (commentPayload) {
      try {
        const commentResult = await erpFetch(
          `${apiEndpoint}/orders/${erpOrderId}/comments`,
          bearerToken,
          "POST",
          commentPayload
        );
        if (commentResult.status < 200 || commentResult.status >= 300) {
          commentWarning = {
            code: "FIELD_SKIPPED",
            field: "comment",
            reason: `Comment POST returned HTTP ${commentResult.status} — non-critical, order update succeeded.`,
          };
        }
      } catch (error: any) {
        commentWarning = {
          code: "FIELD_SKIPPED",
          field: "comment",
          reason: `Comment POST failed: ${error.message} — non-critical, order update succeeded.`,
        };
      }
    }

    if (commentWarning) {
      warnings.push(commentWarning);
    }

    // NOTE: Products HTTP call intentionally skipped — payload is in request_payload for monitoring.

    // ── Write 3: SUCCESS ──
    const now = new Date();
    await erpExportLogsQueries.updateErpExportLog(pool, logId, {
      status: "SUCCESS",
      response_status: orderResult.status,
      response_body: orderResult.body,
      warnings,
      duration_ms: Date.now() - startTime,
      completed_at: now,
    });
    return { logId, exportedAt: now, testMode: false, warnings };
  } catch (error: any) {
    if (error.statusCode) throw error;
    await erpExportLogsQueries.updateErpExportLog(pool, logId, {
      status: "FAILED",
      error_message: error.message ?? "Unknown error",
      error_code: "UNKNOWN_ERROR",
      duration_ms: Date.now() - startTime,
      completed_at: new Date(),
    });
    throw new InternalServerError(`ERP export failed: ${error.message}`);
  }
}
