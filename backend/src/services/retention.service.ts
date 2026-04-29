/**
 * "Poslat na retence" pipeline.
 *
 * Chunk 2 — real exports:
 *   1. Raynet (hard gate): GET /api/v2/event/{id}/, merge tags + append description,
 *      POST /api/v2/event/{id}/ with the merged body.
 *   2. ERP (best-effort, only if order has source_erp_order_id):
 *      PUT /orders/{id} with column_values, then POST /orders/{id}/comments.
 *
 * Test mode skips all external calls but still resolves and logs the planned payloads.
 */

import { Pool } from "pg";
import * as ordersService from "./orders.service";
import * as retentionLogsQueries from "../queries/retention-logs.queries";
import { raynetJsonRequest, type RaynetHttpLogEntry } from "./raynet-api.client";
import { classifyErpHttpError, erpFetch, getErpConfig } from "./erp-export.service";
import {
  RetentionLogRecord,
  RetentionErrorCode,
  RetentionWarningCode,
  RetentionWarning,
} from "../types/retention.types";
import { BadRequestError } from "../utils/errors";

const RETENTION_TAGS = ["CN", "zkontrolováno"];
const RETENTION_DESCRIPTION_PREFIX = "Důvod zaslání na Retence:";
const RETENTION_ERP_COLUMNS = {
  dopadlo_zamereni: "cekame",
  proc_nedopadlo_zamereni: "cenova-nabidka",
} as const;

const REASON_MAX_LENGTH = 4000;

interface SendRetentionParams {
  pool: Pool;
  orderId: number;
  userId: string;
  ovtName: string | null;
  rawReason: unknown;
  testMode: boolean;
}

interface SendRetentionResult {
  logId: number;
  status: RetentionLogRecord["status"];
}

interface ResolvedRequestPayload {
  raynet: {
    event_id: number;
    tags_to_add: string[];
    description_append: string;
  };
  erp: {
    order_id: number;
    column_values: Record<string, string>;
    comment_body: string;
  } | null;
}

function normalizeReason(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new BadRequestError("Důvod je povinný.", "INVALID_REASON" satisfies RetentionErrorCode);
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError("Důvod je povinný.", "INVALID_REASON" satisfies RetentionErrorCode);
  }
  if (trimmed.length > REASON_MAX_LENGTH) {
    throw new BadRequestError(
      `Důvod je příliš dlouhý (max ${REASON_MAX_LENGTH} znaků).`,
      "INVALID_REASON" satisfies RetentionErrorCode
    );
  }
  return trimmed;
}

function classifyRaynetHttpError(status: number): RetentionErrorCode {
  if (status === 401 || status === 403) return "RAYNET_AUTH_FAILED";
  if (status >= 400 && status < 500) return "RAYNET_VALIDATION_ERROR";
  if (status >= 500) return "RAYNET_SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

/** Read tags from a Raynet event GET response. Tags come back as string[] but defensively handle a comma-string. */
function extractCurrentTags(eventBody: unknown): string[] {
  const data = (eventBody as { data?: unknown })?.data ?? eventBody;
  const tags = (data as { tags?: unknown })?.tags;
  if (Array.isArray(tags)) {
    return tags.filter((t): t is string => typeof t === "string");
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  return [];
}

function extractCurrentDescription(eventBody: unknown): string {
  const data = (eventBody as { data?: unknown })?.data ?? eventBody;
  const desc = (data as { description?: unknown })?.description;
  return typeof desc === "string" ? desc : "";
}

function mergeTags(current: string[], toAdd: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...current, ...toAdd]) {
    const trimmed = t.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export async function sendOrderToRetention(
  params: SendRetentionParams
): Promise<SendRetentionResult> {
  const { pool, orderId, userId, ovtName, rawReason, testMode } = params;

  const reason = normalizeReason(rawReason);

  /** Throws NotFoundError if the order doesn't belong to this user. */
  const order = await ordersService.getOrderById(pool, orderId, userId);

  if (order.raynet_id == null) {
    throw new BadRequestError(
      "Tato zakázka nemá vazbu na Raynet, nelze ji odeslat na retence.",
      "MISSING_RAYNET_ID" satisfies RetentionErrorCode
    );
  }
  if (order.source_raynet_event_id == null) {
    /**
     * The retention update writes tags + note onto the Raynet *event*. raynet_id alone (the
     * customer) is not enough — without an event we can't perform the Raynet step.
     */
    throw new BadRequestError(
      "Tato zakázka nemá vazbu na Raynet událost, nelze ji odeslat na retence.",
      "MISSING_RAYNET_ID" satisfies RetentionErrorCode
    );
  }

  const erpOrderId = order.source_erp_order_id ?? null;
  const ovtDisplayName = ovtName && ovtName.trim().length > 0 ? ovtName.trim() : userId;
  const erpCommentBody = `Odesláno na retenci OVT - ${ovtDisplayName}. Důvod: ${reason}`;
  const descriptionAppend = `${RETENTION_DESCRIPTION_PREFIX} ${reason}`;

  const startedAt = Date.now();
  const logId = await retentionLogsQueries.createRetentionLog(pool, {
    order_id: order.id,
    user_id: userId,
    reason,
    raynet_id: order.raynet_id,
    erp_order_id: erpOrderId,
    test_mode: testMode,
  });

  const resolvedPayload: ResolvedRequestPayload = {
    raynet: {
      event_id: order.source_raynet_event_id,
      tags_to_add: [...RETENTION_TAGS],
      description_append: descriptionAppend,
    },
    erp:
      erpOrderId == null
        ? null
        : {
            order_id: erpOrderId,
            column_values: { ...RETENTION_ERP_COLUMNS },
            comment_body: erpCommentBody,
          },
  };

  const warnings: RetentionWarning[] = [];

  await retentionLogsQueries.updateRetentionLog(pool, logId, {
    status: "SENDING",
    request_payload: resolvedPayload as unknown as Record<string, unknown>,
  });

  /** Test mode: stop here, success without any external calls. */
  if (testMode) {
    if (erpOrderId == null) {
      warnings.push({
        code: "ERP_NOT_LINKED" satisfies RetentionWarningCode,
        reason: "Order has no source_erp_order_id — ERP step would be skipped.",
      });
    }
    await retentionLogsQueries.updateRetentionLog(pool, logId, {
      status: "SUCCESS",
      warnings,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date(),
    });
    return { logId, status: "SUCCESS" };
  }

  /** ── Raynet hard gate ──────────────────────────────────────────── */

  const eventId = order.source_raynet_event_id;
  const timeline: RaynetHttpLogEntry[] = [];
  let currentDescription = "";
  let currentTags: string[] = [];

  try {
    const getRes = await raynetJsonRequest({
      step: "retention_raynet_event_get",
      method: "GET",
      path: `/api/v2/event/${eventId}/`,
    }).catch((err: any) => {
      if (err?.raynetLog) timeline.push(err.raynetLog as RaynetHttpLogEntry);
      throw err;
    });
    timeline.push(getRes.log);

    if (getRes.status < 200 || getRes.status >= 300) {
      const errorCode = classifyRaynetHttpError(getRes.status);
      await retentionLogsQueries.updateRetentionLog(pool, logId, {
        status: "FAILED",
        response_status: getRes.status,
        response_body: { eventGet: getRes.body, timeline } as unknown as Record<string, unknown>,
        error_message: `Raynet GET event returned HTTP ${getRes.status}`,
        error_code: errorCode === "UNKNOWN_ERROR" ? "RAYNET_GET_FAILED" : errorCode,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date(),
        warnings,
      });
      throw new BadRequestError(
        `Raynet GET event selhalo (HTTP ${getRes.status}).`,
        errorCode === "UNKNOWN_ERROR" ? "RAYNET_GET_FAILED" : errorCode
      );
    }

    currentDescription = extractCurrentDescription(getRes.body);
    currentTags = extractCurrentTags(getRes.body);
  } catch (error: any) {
    if (error.statusCode) throw error;
    await retentionLogsQueries.updateRetentionLog(pool, logId, {
      status: "FAILED",
      response_body: { timeline } as unknown as Record<string, unknown>,
      error_message: error?.message ?? "Raynet GET failed",
      error_code: "RAYNET_GET_FAILED",
      duration_ms: Date.now() - startedAt,
      completed_at: new Date(),
      warnings,
    });
    throw new BadRequestError(
      "Nepodařilo se načíst data z Raynetu.",
      "RAYNET_GET_FAILED" satisfies RetentionErrorCode
    );
  }

  const mergedDescription =
    currentDescription.length > 0
      ? `${currentDescription}\n${descriptionAppend}`
      : descriptionAppend;
  const mergedTags = mergeTags(currentTags, RETENTION_TAGS);

  const raynetUpdateBody = {
    description: mergedDescription,
    tags: mergedTags.join(", "),
  };

  try {
    const postRes = await raynetJsonRequest({
      step: "retention_raynet_event_update",
      method: "POST",
      path: `/api/v2/event/${eventId}/`,
      body: raynetUpdateBody,
    }).catch((err: any) => {
      if (err?.raynetLog) timeline.push(err.raynetLog as RaynetHttpLogEntry);
      throw err;
    });
    timeline.push(postRes.log);

    if (postRes.status < 200 || postRes.status >= 300) {
      const errorCode = classifyRaynetHttpError(postRes.status);
      await retentionLogsQueries.updateRetentionLog(pool, logId, {
        status: "FAILED",
        response_status: postRes.status,
        response_body: {
          eventGet: { description: currentDescription, tags: currentTags },
          eventUpdate: postRes.body,
          timeline,
        } as unknown as Record<string, unknown>,
        error_message: `Raynet event update returned HTTP ${postRes.status}`,
        error_code: errorCode === "UNKNOWN_ERROR" ? "RAYNET_UPDATE_FAILED" : errorCode,
        duration_ms: Date.now() - startedAt,
        completed_at: new Date(),
        warnings,
      });
      throw new BadRequestError(
        `Raynet event update selhalo (HTTP ${postRes.status}).`,
        errorCode === "UNKNOWN_ERROR" ? "RAYNET_UPDATE_FAILED" : errorCode
      );
    }
  } catch (error: any) {
    if (error.statusCode) throw error;
    await retentionLogsQueries.updateRetentionLog(pool, logId, {
      status: "FAILED",
      response_body: { timeline } as unknown as Record<string, unknown>,
      error_message: error?.message ?? "Raynet update failed",
      error_code: "RAYNET_UPDATE_FAILED",
      duration_ms: Date.now() - startedAt,
      completed_at: new Date(),
      warnings,
    });
    throw new BadRequestError(
      "Nepodařilo se aktualizovat Raynet událost.",
      "RAYNET_UPDATE_FAILED" satisfies RetentionErrorCode
    );
  }

  /** ── ERP best-effort ───────────────────────────────────────────── */

  const erpResults: {
    put: { status: number; body: Record<string, unknown> } | null;
    comment: { status: number; body: Record<string, unknown> } | null;
  } = { put: null, comment: null };
  let finalStatus: RetentionLogRecord["status"] = "SUCCESS";

  if (erpOrderId == null) {
    warnings.push({
      code: "ERP_NOT_LINKED" satisfies RetentionWarningCode,
      reason: "Order has no source_erp_order_id — ERP step skipped.",
    });
  } else {
    try {
      const { apiEndpoint, bearerToken } = getErpConfig();

      try {
        erpResults.put = await erpFetch(
          `${apiEndpoint}/orders/${erpOrderId}`,
          bearerToken,
          "PUT",
          { column_values: { ...RETENTION_ERP_COLUMNS } }
        );

        if (erpResults.put.status < 200 || erpResults.put.status >= 300) {
          const erpErrorCode = classifyErpHttpError(erpResults.put.status);
          warnings.push({
            code: "ERP_PUT_FAILED" satisfies RetentionWarningCode,
            reason: `ERP PUT /orders/${erpOrderId} returned HTTP ${erpResults.put.status} (${erpErrorCode}).`,
          });
          finalStatus = "PARTIAL_SUCCESS";
        } else {
          /** PUT succeeded — try the comment as a non-critical step. */
          try {
            erpResults.comment = await erpFetch(
              `${apiEndpoint}/orders/${erpOrderId}/comments`,
              bearerToken,
              "POST",
              { body: erpCommentBody }
            );
            if (erpResults.comment.status < 200 || erpResults.comment.status >= 300) {
              warnings.push({
                code: "ERP_COMMENT_FAILED" satisfies RetentionWarningCode,
                reason: `ERP comment POST returned HTTP ${erpResults.comment.status}. Column updates already applied.`,
              });
            }
          } catch (commentErr: any) {
            warnings.push({
              code: "ERP_COMMENT_FAILED" satisfies RetentionWarningCode,
              reason: `ERP comment POST failed: ${commentErr?.message ?? "Unknown error"}. Column updates already applied.`,
            });
          }
        }
      } catch (putErr: any) {
        const isTimeout = putErr?.name === "TimeoutError" || putErr?.name === "AbortError";
        warnings.push({
          code: "ERP_PUT_FAILED" satisfies RetentionWarningCode,
          reason: isTimeout
            ? `ERP PUT timed out: ${putErr?.message ?? "timeout"}.`
            : `ERP PUT failed: ${putErr?.message ?? "Unknown error"}.`,
        });
        finalStatus = "PARTIAL_SUCCESS";
      }
    } catch (configErr: any) {
      warnings.push({
        code: "ERP_PUT_FAILED" satisfies RetentionWarningCode,
        reason: `ERP not configured: ${configErr?.message ?? "ERP_CONFIG_MISSING"}.`,
      });
      finalStatus = "PARTIAL_SUCCESS";
    }
  }

  await retentionLogsQueries.updateRetentionLog(pool, logId, {
    status: finalStatus,
    response_body: {
      raynet: {
        before: { description: currentDescription, tags: currentTags },
        after: { description: mergedDescription, tags: mergedTags },
        timeline,
      },
      erp:
        erpOrderId == null
          ? null
          : {
              put: erpResults.put,
              comment: erpResults.comment,
            },
    } as unknown as Record<string, unknown>,
    warnings,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date(),
  });

  return { logId, status: finalStatus };
}

export interface OrderRetentionStatus {
  inRetention: boolean;
  latest: {
    id: number;
    status: RetentionLogRecord["status"];
    test_mode: boolean;
    reason: string;
    created_at: string;
    completed_at: string | null;
  } | null;
}

export async function getOrderRetentionStatus(
  pool: Pool,
  orderId: number,
  userId: string
): Promise<OrderRetentionStatus> {
  /** Verifies ownership; throws if order doesn't belong to user. */
  await ordersService.getOrderById(pool, orderId, userId);

  const latest = await retentionLogsQueries.getLatestRetentionForOrder(pool, orderId, userId);
  const inRetention = await retentionLogsQueries.hasSuccessfulRetentionForOrder(
    pool,
    orderId,
    userId
  );

  return {
    inRetention,
    latest: latest
      ? {
          id: latest.id,
          status: latest.status,
          test_mode: latest.test_mode,
          reason: latest.reason,
          created_at: latest.created_at.toISOString(),
          completed_at: latest.completed_at?.toISOString() ?? null,
        }
      : null,
  };
}
