/**
 * Raynet export pipeline — maps ADMF form_json to Raynet event payload
 * and orchestrates the 3-write logging flow (PENDING → SENDING → SUCCESS/FAILED).
 */

import { Pool } from "pg";
import * as exportLogsQueries from "../queries/raynet-export-logs.queries";
import * as formsQueries from "../queries/forms.queries";
import * as ordersQueries from "../queries/orders.queries";
import { raynetFileUpload, raynetJsonRequest, type RaynetHttpLogEntry } from "./raynet-api.client";
import { collectRaynetAttachmentCandidates } from "./raynet-attachments.service";
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

    const timeline: RaynetHttpLogEntry[] = [];
    const attachmentAttempts: Array<Record<string, unknown>> = [];
    const enabledAttachments = true;

    // ── Write 2: UPDATE log (SENDING) — store payload + warnings (+ placeholders) ──
    await exportLogsQueries.updateExportLog(pool, logId, {
      status: "SENDING",
      request_payload: {
        event_update: payload,
        attachments_enabled: enabledAttachments,
        timeline,
        attachments: attachmentAttempts,
      } as unknown as Record<string, unknown>,
      warnings,
    });

    if (testMode) {
      // ── Test mode: skip Raynet call, log success ──
      const now = new Date();
      await exportLogsQueries.updateExportLog(pool, logId, {
        status: "SUCCESS",
        response_status: 0,
        response_body: {
          testMode: true,
          message: "Skipped — test mode",
          attachments: { enabled: enabledAttachments, skipped: true },
        },
        duration_ms: Date.now() - startTime,
        completed_at: now,
      });
      return { logId, exportedAt: now, testMode: true, warnings };
    }

    // ── Step 3: Event update (hard gate) ──
    const eventRes = await raynetJsonRequest({
      step: "raynet_event_update",
      method: "POST",
      path: `/api/v2/event/${raynetEventId}/`,
      body: payload,
    }).catch((err: any) => {
      if (err?.raynetLog) timeline.push(err.raynetLog as RaynetHttpLogEntry);
      throw err;
    });
    timeline.push(eventRes.log);

    if (eventRes.status < 200 || eventRes.status >= 300) {
      const errorCode = classifyHttpError(eventRes.status);
      const errorMsg = `Raynet returned HTTP ${eventRes.status}`;
      await exportLogsQueries.updateExportLog(pool, logId, {
        status: "FAILED",
        response_status: eventRes.status,
        response_body: {
          eventUpdate: eventRes.body,
          timeline,
        } as unknown as Record<string, unknown>,
        error_message: errorMsg,
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
        completed_at: new Date(),
        warnings,
      });
      throw new InternalServerError(errorMsg);
    }

    // ── Step 4: Attachments (best-effort) ──
    let attachmentsSummary: { enabled: boolean; total: number; uploaded: number; failed: number } = {
      enabled: enabledAttachments,
      total: 0,
      uploaded: 0,
      failed: 0,
    };

    if (enabledAttachments) {
      const candidates = await collectRaynetAttachmentCandidates({ pool, admfFormId: formId, userId });
      attachmentsSummary.total = candidates.length;

      for (const candidate of candidates) {
        const attempt: Record<string, unknown> = {
          filename: candidate.filename,
          contentType: candidate.contentType,
          sizeBytes: candidate.sizeBytes,
          source: candidate.source,
          status: "PENDING",
        };
        attachmentAttempts.push(attempt);

        try {
          const uploadRes = await raynetFileUpload({
            step: "raynet_file_upload",
            filename: candidate.filename,
            contentType: candidate.contentType,
            buffer: candidate.buffer,
          }).catch((err: any) => {
            if (err?.raynetLog) timeline.push(err.raynetLog as RaynetHttpLogEntry);
            throw err;
          });
          timeline.push(uploadRes.log);

          if (uploadRes.status < 200 || uploadRes.status >= 300) {
            throw new Error(`fileUpload returned HTTP ${uploadRes.status}`);
          }

          const fileInfo = uploadRes.body as Record<string, unknown>;
          attempt.fileUpload = fileInfo;

          const attachmentRes = await raynetJsonRequest({
            step: "raynet_attachment_create",
            method: "PUT",
            path: `/api/v2/attachment/event/${raynetEventId}/`,
            body: {
              uuid: fileInfo.uuid,
              fileName: fileInfo.fileName ?? candidate.filename,
              contentType: fileInfo.contentType ?? candidate.contentType,
              fileSize: fileInfo.fileSize ?? candidate.sizeBytes,
            },
          }).catch((err: any) => {
            if (err?.raynetLog) timeline.push(err.raynetLog as RaynetHttpLogEntry);
            throw err;
          });
          timeline.push(attachmentRes.log);

          if (attachmentRes.status < 200 || attachmentRes.status >= 300) {
            throw new Error(`attachment create returned HTTP ${attachmentRes.status}`);
          }

          attempt.attachment = attachmentRes.body;
          attempt.status = "SUCCESS";
          attachmentsSummary.uploaded += 1;
        } catch (error: any) {
          attempt.status = "FAILED";
          attempt.error = { message: error?.message ?? "Unknown error" };
          attachmentsSummary.failed += 1;
          warnings.push({
            code: "FIELD_SKIPPED",
            field: `attachment:${candidate.filename}`,
            reason: error?.message ?? "Attachment upload failed",
          });
        } finally {
          // Persist progress periodically (keeps polling UI responsive)
          await exportLogsQueries.updateExportLog(pool, logId, {
            request_payload: {
              event_update: payload,
              attachments_enabled: enabledAttachments,
              timeline,
              attachments: attachmentAttempts,
              attachments_summary: attachmentsSummary,
            } as unknown as Record<string, unknown>,
            warnings,
          });
        }
      }
    }

    // ── Write 3: Final status ──
    const now = new Date();
    const finalStatus = enabledAttachments && attachmentsSummary.failed > 0 ? "PARTIAL_SUCCESS" : "SUCCESS";
    await exportLogsQueries.updateExportLog(pool, logId, {
      status: finalStatus,
      response_status: eventRes.status,
      response_body: {
        eventUpdate: eventRes.body,
        attachments: attachmentsSummary,
        timeline,
      } as unknown as Record<string, unknown>,
      warnings,
      duration_ms: Date.now() - startTime,
      completed_at: now,
    });
    return { logId, exportedAt: now, testMode: false, warnings };
  } catch (error: any) {
    // Catch-all: if anything above threw without updating the log, update it now
    if (error.statusCode) {
      // Already an ApiError (might already be logged) — re-throw
      throw error;
    }
    // Unexpected error — log it
    const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";
    const errorCode: ExportErrorCode = isTimeout ? "RAYNET_TIMEOUT" : "UNKNOWN_ERROR";
    await exportLogsQueries.updateExportLog(pool, logId, {
      status: "FAILED",
      error_message: error.message ?? "Unknown error",
      error_code: errorCode,
      duration_ms: Date.now() - startTime,
      completed_at: new Date(),
    });
    throw new InternalServerError(`Export failed: ${error.message}`);
  }
}
