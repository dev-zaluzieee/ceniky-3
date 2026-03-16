/**
 * Raynet export pipeline — maps ADMF form_json to Raynet event payload
 * and orchestrates the 3-write logging flow (PENDING → SENDING → SUCCESS/FAILED).
 */

import { Pool } from "pg";
import * as exportLogsQueries from "../queries/raynet-export-logs.queries";
import * as formsQueries from "../queries/forms.queries";
import * as ordersQueries from "../queries/orders.queries";
import {
  ExportWarning,
  ExportErrorCode,
  RaynetEventUpdatePayload,
} from "../types/raynet-export.types";
import { BadRequestError, InternalServerError } from "../utils/errors";

/** Raynet event category for ADMF exports */
const RAYNET_CATEGORY_ID = 220;

// ── Mapping ──────────────────────────────────────────────────────

interface MappingResult {
  payload: RaynetEventUpdatePayload;
  warnings: ExportWarning[];
}

/**
 * Map ADMF form_json → Raynet event update payload.
 * Collects warnings for non-fatal issues instead of throwing.
 */
export function buildRaynetPayload(
  formJson: Record<string, any>,
  raynetName: string | undefined
): MappingResult {
  const warnings: ExportWarning[] = [];
  const cf: Record<string, unknown> = {};

  // ── Direct string mappings (optional — send only if filled) ──
  mapOptionalString(cf, "Email_1181e", formJson.email, "email", warnings);
  mapOptionalString(cf, "Dalsi_kont_dcaae", formJson.telefon, "telefon", warnings);
  mapOptionalString(cf, "Zvonek_60b5d", formJson.zvonek, "zvonek", warnings);
  mapOptionalString(cf, "Patro_4784d", formJson.patro, "patro", warnings);
  mapOptionalString(cf, "Info_k_par_4946a", formJson.infoKParkovani, "infoKParkovani", warnings);
  mapOptionalString(cf, "Duvod_neuh_fec41", formJson.infoKZaloze, "infoKZaloze", warnings);
  mapOptionalString(cf, "Info_k_fak_4dcbc", formJson.infoKFakture, "infoKFakture", warnings);

  // ── Enum: vatRate → DPH (number → string) ──
  const vatRate = formJson.vatRate ?? 12;
  const vatStr = String(vatRate);
  if (["0", "12", "21"].includes(vatStr)) {
    cf.DPH_a6f2e = vatStr;
  } else {
    warnings.push({ code: "ENUM_MISMATCH", field: "vatRate", reason: `Value "${vatStr}" not in allowed values (0, 12, 21)` });
  }

  // ── Enum: typZarizeni (1:1) ──
  const typZarizeniAllowed = ["RD", "Byt", "Nebytový protor", "chata", "vila", "Obytná maringotka"];
  if (formJson.typZarizeni) {
    if (typZarizeniAllowed.includes(formJson.typZarizeni)) {
      cf.RDbyt_45fb8 = formJson.typZarizeni;
    } else {
      warnings.push({ code: "ENUM_MISMATCH", field: "typZarizeni", reason: `Value "${formJson.typZarizeni}" not in Raynet enum` });
    }
  }

  // ── Enum: zalohaZaplacena (1:1) ──
  const zalohaAllowed = ["Hotově", "Terminálem", "QR", "Fakturou", "převodem"];
  if (formJson.zalohaZaplacena) {
    if (zalohaAllowed.includes(formJson.zalohaZaplacena)) {
      cf.Zpusob_uhr_1bc0a = formJson.zalohaZaplacena;
    } else {
      warnings.push({ code: "ENUM_MISMATCH", field: "zalohaZaplacena", reason: `Value "${formJson.zalohaZaplacena}" not in Raynet enum` });
    }
  }

  // ── Monetary: zalohovaFaktura (deposit with VAT) ──
  if (formJson.zalohovaFaktura != null && formJson.zalohovaFaktura > 0) {
    cf.Zaloha_f384a = formJson.zalohovaFaktura;
  }

  // ── Monetary: doplatek ──
  const totalBezDph = computeTotalBezDph(formJson);
  const totalSDph = Math.round(totalBezDph * (1 + vatRate / 100));
  const doplatek = formJson.doplatek ?? Math.max(0, totalSDph - (formJson.zalohovaFaktura ?? 0));
  cf.Doplatek_98b22 = doplatek;

  // ── Computed: totalSDph ──
  cf.Celkova_ho_0b99a = totalSDph;

  // ── BIG_DECIMAL: variabilniSymbol ──
  if (formJson.variabilniSymbol != null && formJson.variabilniSymbol > 0) {
    cf.Variabilni_675b2 = formJson.variabilniSymbol;
  }

  // ── Enum: zaměřovač (from auth) ──
  if (raynetName) {
    cf.Zamerovac_2b7ef = raynetName;
  } else {
    warnings.push({ code: "FIELD_EMPTY", field: "Zamerovac_2b7ef", reason: "raynet_name not available in user auth profile" });
  }

  // ── Boolean: MNG sleva ──
  cf.MNG_SLEVA_aac47 = formJson.mngSleva === true;

  // ── Monetary: MNG sleva částka ──
  if (formJson.mngSleva && (formJson.mngSlevaCastka ?? 0) > 0) {
    cf.MNG_sleva__0836b = formJson.mngSlevaCastka;
  }

  // ── Monetary: OVT sleva částka ──
  if ((formJson.ovtSlevaCastka ?? 0) > 0) {
    cf.OVT_sleva__909bc = formJson.ovtSlevaCastka;
  }

  // ── Merge: poznámky → Dalsi_dopl_1e01a ──
  const vyrobaText = (formJson.poznamkyVyroba ?? "").trim();
  const montazText = (formJson.poznamkyMontaz ?? "").trim();
  const mergedNotes = [
    vyrobaText ? `Výroba: ${vyrobaText}` : "",
    montazText ? `Montáž: ${montazText}` : "",
  ].filter(Boolean).join("\n");
  if (mergedNotes) {
    cf.Dalsi_dopl_1e01a = mergedNotes;
  }

  // ── Composed: adresaKdyzNesedi ──
  if (formJson.jinaAdresaDodani) {
    const parts = [
      formJson.dodaciUlice,
      formJson.dodaciMesto,
      formJson.dodaciPsc,
    ].filter(Boolean);
    if (parts.length > 0) {
      cf.Adresa_kdy_8f1ac = parts.join(", ");
    }
  }

  return {
    payload: {
      category: RAYNET_CATEGORY_ID,
      status: "COMPLETED",
      customFields: cf,
    },
    warnings,
  };
}

function computeTotalBezDph(formJson: Record<string, any>): number {
  const rows = formJson.productRows || [];
  const productTotal = rows.reduce(
    (sum: number, r: any) => sum + ((r.cenaPoSleve ?? 0) * (r.ks ?? 1)),
    0
  );
  return productTotal + (formJson.montazCenaBezDph ?? 1339);
}

function mapOptionalString(
  cf: Record<string, unknown>,
  raynetKey: string,
  value: unknown,
  fieldName: string,
  warnings: ExportWarning[]
): void {
  if (value != null && typeof value === "string" && value.trim() !== "") {
    cf[raynetKey] = value.trim();
  }
}

// ── Raynet HTTP call ─────────────────────────────────────────────

async function sendToRaynet(
  eventId: number,
  payload: RaynetEventUpdatePayload
): Promise<{ status: number; body: Record<string, unknown> }> {
  const authorization = process.env.RAYNET_AUTHORIZATION || process.env.RAYNET_BASIC_AUTH;
  const instanceName = process.env.RAYNET_INSTANCE_NAME;

  if (!authorization || !instanceName) {
    throw Object.assign(
      new InternalServerError("Raynet API is not configured (missing env vars)"),
      { errorCode: "RAYNET_CONFIG_MISSING" as ExportErrorCode }
    );
  }

  const authHeader = authorization.startsWith("Basic ")
    ? authorization
    : `Basic ${authorization}`;

  const url = `https://app.raynet.cz/api/v2/event/${eventId}/`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "X-Instance-Name": instanceName,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = { rawText: await response.text().catch(() => "unreadable") };
  }

  return { status: response.status, body };
}

function classifyHttpError(status: number): ExportErrorCode {
  if (status === 401 || status === 403) return "RAYNET_AUTH_FAILED";
  if (status >= 400 && status < 500) return "RAYNET_VALIDATION_ERROR";
  if (status >= 500) return "RAYNET_SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

// ── Main pipeline ────────────────────────────────────────────────

export interface ExportResult {
  logId: number;
  exportedAt: Date;
  testMode: boolean;
  warnings: ExportWarning[];
}

/**
 * Full export pipeline with 3-write logging.
 * @param pool - DB pool
 * @param formId - ADMF form ID
 * @param userId - Authenticated user (email)
 * @param raynetName - User's Raynet display name (from auth/JWT)
 * @param testMode - When true, skip actual Raynet HTTP call
 */
export async function exportFormToRaynet(
  pool: Pool,
  formId: number,
  userId: string,
  raynetName: string | undefined,
  testMode: boolean,
  exportBatchId?: string
): Promise<ExportResult> {
  // ── Step 0: Load form + order, resolve event ID ──
  const form = await formsQueries.getFormById(pool, formId, userId);
  if (!form) throw new BadRequestError("Form not found", "FORM_NOT_FOUND");
  if (form.form_type !== "admf") throw new BadRequestError("Only ADMF forms can be exported to Raynet");

  const orderId = form.order_id;
  if (!orderId) throw new BadRequestError("Form is not linked to an order");

  const order = await ordersQueries.getOrderById(pool, orderId, userId);
  if (!order) throw new BadRequestError("Order not found", "ORDER_NOT_FOUND");

  const raynetEventId = order.source_raynet_event_id;
  if (!raynetEventId) {
    throw new BadRequestError(
      "Order has no linked Raynet event (source_raynet_event_id is empty)",
      "MISSING_EVENT_ID"
    );
  }

  // ── Write 1: CREATE log (PENDING) ──
  const startTime = Date.now();
  const logId = await exportLogsQueries.createExportLog(pool, {
    form_id: formId,
    order_id: orderId,
    raynet_event_id: raynetEventId,
    user_id: userId,
    test_mode: testMode,
    export_batch_id: exportBatchId,
  });

  try {
    // ── Build payload ──
    const { payload, warnings } = buildRaynetPayload(form.form_json, raynetName);

    // ── Write 2: UPDATE log (SENDING) — store payload + warnings ──
    await exportLogsQueries.updateExportLog(pool, logId, {
      status: "SENDING",
      request_payload: payload as unknown as Record<string, unknown>,
      warnings,
    });

    if (testMode) {
      // ── Test mode: skip Raynet call, log success ──
      const now = new Date();
      await exportLogsQueries.updateExportLog(pool, logId, {
        status: "SUCCESS",
        response_status: 0,
        response_body: { testMode: true, message: "Skipped — test mode" },
        duration_ms: Date.now() - startTime,
        completed_at: now,
      });
      return { logId, exportedAt: now, testMode: true, warnings };
    }

    // ── Step 3: Call Raynet API ──
    let httpResult: { status: number; body: Record<string, unknown> };
    try {
      httpResult = await sendToRaynet(raynetEventId, payload);
    } catch (error: any) {
      const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";
      const errorCode: ExportErrorCode = isTimeout ? "RAYNET_TIMEOUT" : "UNKNOWN_ERROR";

      await exportLogsQueries.updateExportLog(pool, logId, {
        status: "FAILED",
        error_message: error.message,
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
        completed_at: new Date(),
      });
      throw new InternalServerError(
        isTimeout ? "Raynet API request timed out" : `Raynet API call failed: ${error.message}`
      );
    }

    // ── Write 3: Final status ──
    if (httpResult.status >= 200 && httpResult.status < 300) {
      const now = new Date();
      await exportLogsQueries.updateExportLog(pool, logId, {
        status: "SUCCESS",
        response_status: httpResult.status,
        response_body: httpResult.body,
        duration_ms: Date.now() - startTime,
        completed_at: now,
      });
      return { logId, exportedAt: now, testMode: false, warnings };
    } else {
      const errorCode = classifyHttpError(httpResult.status);
      const errorMsg = `Raynet returned HTTP ${httpResult.status}`;
      await exportLogsQueries.updateExportLog(pool, logId, {
        status: "FAILED",
        response_status: httpResult.status,
        response_body: httpResult.body,
        error_message: errorMsg,
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
        completed_at: new Date(),
      });
      throw new InternalServerError(errorMsg);
    }
  } catch (error: any) {
    // Catch-all: if anything above threw without updating the log, update it now
    if (error.statusCode) {
      // Already an ApiError (might already be logged) — re-throw
      throw error;
    }
    // Unexpected error — log it
    await exportLogsQueries.updateExportLog(pool, logId, {
      status: "FAILED",
      error_message: error.message ?? "Unknown error",
      error_code: "UNKNOWN_ERROR",
      duration_ms: Date.now() - startTime,
      completed_at: new Date(),
    });
    throw new InternalServerError(`Export failed: ${error.message}`);
  }
}
