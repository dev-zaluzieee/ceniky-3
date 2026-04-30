/**
 * OVT-side "Poslat na retence" pipeline (chunk 4).
 *
 * Two-step workflow:
 *   - OVT clicks the button → this service runs.
 *     A) Insert retention_logs row with kind='OVT_REQUEST' + reason.
 *     B) Set Retence_7fbd1=true on the Raynet event (GET-merge so other custom fields survive).
 *     No tags, no description append, no ERP. The full export runs later when an
 *     office user processes the request from /fronta-retenci on the office side.
 *
 *   - Office user later "processes" the request (in the office app) — that runs the
 *     full Raynet (CN, zkontrolováno, description) + ERP export, AND closes the OVT
 *     request via processed_at / processed_log_id on the row this service inserted.
 */

import { Pool } from "pg";
import * as ordersService from "./orders.service";
import * as retentionLogsQueries from "../queries/retention-logs.queries";
import { raynetJsonRequest, type RaynetHttpLogEntry } from "./raynet-api.client";
import {
  RetentionLogRecord,
  RetentionErrorCode,
  RetentionWarning,
} from "../types/retention.types";
import { BadRequestError } from "../utils/errors";

const RETENTION_CN_TAG = "CN";
const RETENTION_CUSTOM_FIELD = "Retence_7fbd1";
const REASON_MAX_LENGTH = 4000;

interface SendRetentionParams {
  pool: Pool;
  orderId: number;
  userId: string;
  rawReason: unknown;
  testMode: boolean;
}

interface SendRetentionResult {
  logId: number;
  status: RetentionLogRecord["status"];
}

interface ResolvedRequestPayload {
  kind: "OVT_REQUEST";
  raynet: {
    event_id: number;
    custom_fields: Record<string, unknown>;
  };
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

function extractCustomFieldsFromEvent(eventBody: unknown): Record<string, unknown> {
  const data = (eventBody as { data?: unknown })?.data ?? eventBody;
  const cf = (data as { customFields?: unknown })?.customFields;
  if (cf && typeof cf === "object" && !Array.isArray(cf)) {
    return { ...(cf as Record<string, unknown>) };
  }
  return {};
}

function extractTagsFromEvent(eventBody: unknown): string[] {
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

function tagsContainCn(tags: string[]): boolean {
  return tags.some((t) => t.trim().toLowerCase() === RETENTION_CN_TAG.toLowerCase());
}

export async function sendOrderToRetention(
  params: SendRetentionParams
): Promise<SendRetentionResult> {
  const { pool, orderId, userId, rawReason, testMode } = params;

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
    throw new BadRequestError(
      "Tato zakázka nemá vazbu na Raynet událost, nelze ji odeslat na retence.",
      "MISSING_RAYNET_ID" satisfies RetentionErrorCode
    );
  }

  const eventId = order.source_raynet_event_id;
  const startedAt = Date.now();

  const logId = await retentionLogsQueries.createRetentionLog(pool, {
    order_id: order.id,
    user_id: userId,
    reason,
    raynet_id: order.raynet_id,
    raynet_event_id: eventId,
    erp_order_id: order.source_erp_order_id ?? null,
    test_mode: testMode,
    kind: "OVT_REQUEST",
  });

  const resolvedPayload: ResolvedRequestPayload = {
    kind: "OVT_REQUEST",
    raynet: {
      event_id: eventId,
      custom_fields: { [RETENTION_CUSTOM_FIELD]: true },
    },
  };

  const warnings: RetentionWarning[] = [];

  await retentionLogsQueries.updateRetentionLog(pool, logId, {
    status: "SENDING",
    request_payload: resolvedPayload as unknown as Record<string, unknown>,
  });

  /** Test mode: no Raynet call, mark SUCCESS immediately. */
  if (testMode) {
    await retentionLogsQueries.updateRetentionLog(pool, logId, {
      status: "SUCCESS",
      warnings,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date(),
    });
    return { logId, status: "SUCCESS" };
  }

  /** ── Raynet GET-merge-POST for the customField only ──────────────── */

  const timeline: RaynetHttpLogEntry[] = [];
  let currentCustomFields: Record<string, unknown> = {};

  try {
    const getRes = await raynetJsonRequest({
      step: "ovt_request_raynet_event_get",
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

    currentCustomFields = extractCustomFieldsFromEvent(getRes.body);
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

  /** Merge our flag with the existing customFields so we don't clobber other fields. */
  const mergedCustomFields = { ...currentCustomFields, [RETENTION_CUSTOM_FIELD]: true };

  try {
    const postRes = await raynetJsonRequest({
      step: "ovt_request_raynet_event_update",
      method: "POST",
      path: `/api/v2/event/${eventId}/`,
      body: { customFields: mergedCustomFields },
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

  await retentionLogsQueries.updateRetentionLog(pool, logId, {
    status: "SUCCESS",
    response_body: {
      raynet: {
        before: { customFields: currentCustomFields },
        after: { customFields: mergedCustomFields },
        timeline,
      },
    } as unknown as Record<string, unknown>,
    warnings,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date(),
  });

  return { logId, status: "SUCCESS" };
}

export interface OrderRetentionStatus {
  /** State B: "V retencích" — Raynet event has CN tag. Computed via one Raynet GET on page load. */
  inRetention: boolean;
  /** State A: "Zasláno na retence" — open OVT_REQUEST in our DB for this order. */
  inRetentionRequested: boolean;
  /** OVT note + identity from the open OVT_REQUEST, for display. Null when no open request. */
  openRequest: {
    id: number;
    reason: string;
    user_id: string;
    created_at: string;
  } | null;
  /** Most recent log row of any kind, for the "already sent — confirm resend" gate. */
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
  const order = await ordersService.getOrderById(pool, orderId, userId);

  const latest = await retentionLogsQueries.getLatestRetentionForOrder(pool, orderId, userId);
  const openRequest = await retentionLogsQueries.getOpenOvtRequestForOrder(pool, orderId, userId);

  /** State B comes from Raynet — degrade gracefully if Raynet is unreachable. */
  let inRetention = false;
  if (order.source_raynet_event_id != null) {
    try {
      const getRes = await raynetJsonRequest({
        step: "retention_status_raynet_event_get",
        method: "GET",
        path: `/api/v2/event/${order.source_raynet_event_id}/`,
      });
      if (getRes.status >= 200 && getRes.status < 300) {
        inRetention = tagsContainCn(extractTagsFromEvent(getRes.body));
      }
    } catch {
      /** Page still loads, badge just doesn't render. */
    }
  }

  return {
    inRetention,
    inRetentionRequested: openRequest != null,
    openRequest: openRequest
      ? {
          id: openRequest.id,
          reason: openRequest.reason,
          user_id: openRequest.user_id,
          created_at: openRequest.created_at.toISOString(),
        }
      : null,
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
