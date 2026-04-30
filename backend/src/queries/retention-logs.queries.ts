/**
 * Raw SQL queries for retention_logs operations.
 */

import { Pool } from "pg";
import {
  RetentionLogRecord,
  CreateRetentionLogParams,
  UpdateRetentionLogParams,
} from "../types/retention.types";
import { DatabaseError } from "../utils/errors";

export async function createRetentionLog(
  pool: Pool,
  params: CreateRetentionLogParams
): Promise<number> {
  const kind = params.kind ?? "OVT_REQUEST";
  const query = `
    INSERT INTO retention_logs (order_id, user_id, reason, raynet_id, raynet_event_id, erp_order_id, status, test_mode, kind)
    VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8)
    RETURNING id
  `;
  try {
    const result = await pool.query(query, [
      params.order_id,
      params.user_id,
      params.reason,
      params.raynet_id,
      params.raynet_event_id,
      params.erp_order_id,
      params.test_mode,
      kind,
    ]);
    return result.rows[0].id;
  } catch (error: any) {
    throw new DatabaseError(`Failed to create retention log: ${error.message}`, error);
  }
}

export interface OpenOvtRequestRow {
  id: number;
  reason: string;
  user_id: string;
  created_at: Date;
}

/**
 * Latest open (unprocessed) OVT_REQUEST for an order owned by the given user.
 * Drives the OVT-side state A check + the resend-confirmation modal text.
 */
export async function getOpenOvtRequestForOrder(
  pool: Pool,
  orderId: number,
  userId: string
): Promise<OpenOvtRequestRow | null> {
  const query = `
    SELECT id, reason, user_id, created_at
      FROM retention_logs
     WHERE kind = 'OVT_REQUEST'
       AND processed_at IS NULL
       AND order_id = $1
       AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 1
  `;
  try {
    const result = await pool.query(query, [orderId, userId]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      reason: row.reason,
      user_id: row.user_id,
      created_at: new Date(row.created_at),
    };
  } catch (error: any) {
    throw new DatabaseError(`Failed to load open OVT request: ${error.message}`, error);
  }
}

export async function updateRetentionLog(
  pool: Pool,
  logId: number,
  params: UpdateRetentionLogParams
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.status !== undefined) {
    setClauses.push(`status = $${idx++}`);
    values.push(params.status);
  }
  if (params.request_payload !== undefined) {
    setClauses.push(`request_payload = $${idx++}::jsonb`);
    values.push(JSON.stringify(params.request_payload));
  }
  if (params.response_status !== undefined) {
    setClauses.push(`response_status = $${idx++}`);
    values.push(params.response_status);
  }
  if (params.response_body !== undefined) {
    setClauses.push(`response_body = $${idx++}::jsonb`);
    values.push(JSON.stringify(params.response_body));
  }
  if (params.error_message !== undefined) {
    setClauses.push(`error_message = $${idx++}`);
    values.push(params.error_message);
  }
  if (params.error_code !== undefined) {
    setClauses.push(`error_code = $${idx++}`);
    values.push(params.error_code);
  }
  if (params.warnings !== undefined) {
    setClauses.push(`warnings = $${idx++}::jsonb`);
    values.push(JSON.stringify(params.warnings));
  }
  if (params.duration_ms !== undefined) {
    setClauses.push(`duration_ms = $${idx++}`);
    values.push(params.duration_ms);
  }
  if (params.completed_at !== undefined) {
    setClauses.push(`completed_at = $${idx++}`);
    values.push(params.completed_at);
  }

  if (setClauses.length === 0) return;

  values.push(logId);
  const query = `UPDATE retention_logs SET ${setClauses.join(", ")} WHERE id = $${idx}`;

  try {
    await pool.query(query, values);
  } catch (error: any) {
    /** Never let a log-update failure mask the real error from the calling service. */
    console.error(`Failed to update retention log ${logId}:`, error.message);
  }
}

/**
 * Latest retention log for an order, any status. Used by the OVT page to render the
 * "already in retention" badge and gate the resend confirmation modal.
 */
export async function getLatestRetentionForOrder(
  pool: Pool,
  orderId: number,
  userId: string
): Promise<RetentionLogRecord | null> {
  const query = `
    SELECT *
    FROM retention_logs
    WHERE order_id = $1 AND user_id = $2
    ORDER BY created_at DESC
    LIMIT 1
  `;
  try {
    const result = await pool.query(query, [orderId, userId]);
    if (result.rows.length === 0) return null;
    return mapRowToRetentionLog(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to get retention log: ${error.message}`, error);
  }
}

/**
 * Whether the order has any successful retention attempt.
 * Chunk-1 truth source for "is in retention". Chunk-2 will swap to checking Raynet `CN` tag.
 */
export async function hasSuccessfulRetentionForOrder(
  pool: Pool,
  orderId: number,
  userId: string
): Promise<boolean> {
  const query = `
    SELECT 1
    FROM retention_logs
    WHERE order_id = $1 AND user_id = $2 AND status IN ('SUCCESS', 'PARTIAL_SUCCESS')
    LIMIT 1
  `;
  try {
    const result = await pool.query(query, [orderId, userId]);
    return (result.rowCount ?? 0) > 0;
  } catch (error: any) {
    throw new DatabaseError(`Failed to check retention status: ${error.message}`, error);
  }
}

function mapRowToRetentionLog(row: any): RetentionLogRecord {
  return {
    id: row.id,
    order_id: row.order_id,
    user_id: row.user_id,
    reason: row.reason,
    raynet_id: row.raynet_id,
    erp_order_id: row.erp_order_id,
    status: row.status,
    test_mode: row.test_mode,
    request_payload: row.request_payload,
    response_status: row.response_status,
    response_body: row.response_body,
    error_message: row.error_message,
    error_code: row.error_code,
    warnings: row.warnings,
    duration_ms: row.duration_ms,
    created_at: new Date(row.created_at),
    completed_at: row.completed_at ? new Date(row.completed_at) : null,
  };
}
