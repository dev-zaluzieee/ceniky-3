/**
 * Raw SQL queries for erp_export_logs operations
 */

import { Pool } from "pg";
import {
  ErpExportLogRecord,
  CreateErpExportLogParams,
  UpdateErpExportLogParams,
} from "../types/erp-export.types";
import { DatabaseError } from "../utils/errors";

/**
 * Insert a new ERP export log with PENDING status.
 */
export async function createErpExportLog(
  pool: Pool,
  params: CreateErpExportLogParams
): Promise<number> {
  const query = `
    INSERT INTO erp_export_logs (form_id, order_id, erp_order_id, user_id, export_batch_id, status, test_mode)
    VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
    RETURNING id
  `;
  try {
    const result = await pool.query(query, [
      params.form_id,
      params.order_id,
      params.erp_order_id,
      params.user_id,
      params.export_batch_id ?? null,
      params.test_mode,
    ]);
    return result.rows[0].id;
  } catch (error: any) {
    throw new DatabaseError(`Failed to create ERP export log: ${error.message}`, error);
  }
}

/**
 * Update an existing ERP export log. Only provided fields are updated.
 */
export async function updateErpExportLog(
  pool: Pool,
  logId: number,
  params: UpdateErpExportLogParams
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
  const query = `UPDATE erp_export_logs SET ${setClauses.join(", ")} WHERE id = $${idx}`;

  try {
    await pool.query(query, values);
  } catch (error: any) {
    // Log but don't throw — never mask the real error
    console.error(`Failed to update ERP export log ${logId}:`, error.message);
  }
}

/**
 * Get the most recent successful ERP export log for a form.
 */
export async function getLatestErpExportForForm(
  pool: Pool,
  formId: number
): Promise<ErpExportLogRecord | null> {
  const query = `
    SELECT *
    FROM erp_export_logs
    WHERE form_id = $1 AND status = 'SUCCESS'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  try {
    const result = await pool.query(query, [formId]);
    if (result.rows.length === 0) return null;
    return mapRowToErpExportLog(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to get ERP export log: ${error.message}`, error);
  }
}

function mapRowToErpExportLog(row: any): ErpExportLogRecord {
  return {
    id: row.id,
    form_id: row.form_id,
    order_id: row.order_id,
    erp_order_id: row.erp_order_id,
    user_id: row.user_id,
    export_batch_id: row.export_batch_id,
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
