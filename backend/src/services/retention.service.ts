/**
 * "Poslat na retence" pipeline.
 *
 * Chunk 1: writes a retention_logs row end-to-end with a stub `request_payload`
 * describing the Raynet/ERP calls that *will* happen in chunk 2. No external
 * calls are made here yet.
 *
 * Chunk 2 will replace the stub block with real Raynet (tags + note append)
 * and ERP (Dopadlo to? / Proč ne zaměření) updates inside the same orchestration.
 */

import { Pool } from "pg";
import * as ordersService from "./orders.service";
import * as retentionLogsQueries from "../queries/retention-logs.queries";
import {
  RetentionLogRecord,
  RetentionErrorCode,
} from "../types/retention.types";
import { BadRequestError } from "../utils/errors";

const PRODUCTION_NOT_AVAILABLE_MESSAGE =
  "Odeslání na retence zatím není v produkci dostupné.";

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

/**
 * Build the "what we *would* send" payload for chunk-1 logs.
 * Mirrors the eventual chunk-2 request shape so the data model is exercised.
 */
function buildStubPlan(params: {
  raynetId: number;
  erpOrderId: number | null;
  reason: string;
}): Record<string, unknown> {
  const noteAppend = `Důvod zaslání na Retence: ${params.reason}`;
  return {
    chunk: "stub-1",
    raynet: {
      customer_id: params.raynetId,
      tags_to_add: ["CN", "zkontrolováno"],
      note_append: noteAppend,
    },
    erp:
      params.erpOrderId == null
        ? null
        : {
            order_id: params.erpOrderId,
            field_updates: {
              "Dopadlo to?": "čekáme",
              "Proč ne zaměření": "cenová nabídka",
            },
          },
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

/**
 * Submit a "Poslat na retence" attempt for the given order.
 * Throws BadRequestError on validation / production-mode refusal — caller maps to HTTP.
 */
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

  const startedAt = Date.now();
  const logId = await retentionLogsQueries.createRetentionLog(pool, {
    order_id: order.id,
    user_id: userId,
    reason,
    raynet_id: order.raynet_id,
    erp_order_id: order.source_erp_order_id ?? null,
    test_mode: testMode,
  });

  if (!testMode) {
    /** Production not yet wired — refuse, but write the FAILED row first so the admin sees the attempt. */
    await retentionLogsQueries.updateRetentionLog(pool, logId, {
      status: "FAILED",
      error_code: "RETENCE_PRODUCTION_NOT_AVAILABLE",
      error_message: PRODUCTION_NOT_AVAILABLE_MESSAGE,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date(),
    });
    throw new BadRequestError(
      PRODUCTION_NOT_AVAILABLE_MESSAGE,
      "RETENCE_PRODUCTION_NOT_AVAILABLE" satisfies RetentionErrorCode
    );
  }

  const stubPlan = buildStubPlan({
    raynetId: order.raynet_id,
    erpOrderId: order.source_erp_order_id ?? null,
    reason,
  });

  await retentionLogsQueries.updateRetentionLog(pool, logId, {
    status: "SUCCESS",
    request_payload: stubPlan,
    duration_ms: Date.now() - startedAt,
    completed_at: new Date(),
  });

  return { logId, status: "SUCCESS" };
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
