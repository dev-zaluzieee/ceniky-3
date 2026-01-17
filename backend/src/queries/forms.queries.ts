/**
 * Raw SQL queries for forms operations
 * All queries use parameterized statements to prevent SQL injection
 */

import { Pool } from "pg";
import { FormType, FormRecord, ListFormsQuery } from "../types/forms.types";
import { DatabaseError, NotFoundError } from "../utils/errors";

/**
 * Create a new form record
 * @param pool - Database connection pool
 * @param userId - User ID (email)
 * @param formType - Type of form
 * @param formJson - Form data as JSON object
 * @returns Created form record
 */
export async function createForm(
  pool: Pool,
  userId: string,
  formType: FormType,
  formJson: Record<string, any>
): Promise<FormRecord> {
  const query = `
    INSERT INTO forms (user_id, form_type, form_json)
    VALUES ($1, $2, $3::jsonb)
    RETURNING id, user_id, form_type, form_json, created_at, updated_at, deleted_at
  `;

  try {
    const result = await pool.query(query, [userId, formType, JSON.stringify(formJson)]);
    return mapRowToFormRecord(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to create form: ${error.message}`, error);
  }
}

/**
 * Get a form by ID (only if not deleted and belongs to user)
 * @param pool - Database connection pool
 * @param id - Form ID
 * @param userId - User ID for authorization check
 * @returns Form record or null if not found
 */
export async function getFormById(pool: Pool, id: number, userId: string): Promise<FormRecord | null> {
  const query = `
    SELECT id, user_id, form_type, form_json, created_at, updated_at, deleted_at
    FROM forms
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
  `;

  try {
    const result = await pool.query(query, [id, userId]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToFormRecord(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to get form: ${error.message}`, error);
  }
}

/**
 * Get forms for a user with optional filtering and pagination
 * @param pool - Database connection pool
 * @param userId - User ID
 * @param options - Query options (form_type, page, limit)
 * @returns Array of form records and total count
 */
export async function getFormsByUserId(
  pool: Pool,
  userId: string,
  options: ListFormsQuery = {}
): Promise<{ forms: FormRecord[]; total: number }> {
  const { form_type, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  // Build WHERE clause dynamically
  const conditions = ["user_id = $1", "deleted_at IS NULL"];
  const params: any[] = [userId];
  let paramIndex = 2;

  if (form_type) {
    conditions.push(`form_type = $${paramIndex}`);
    params.push(form_type);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM forms WHERE ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total, 10);

  // Get paginated results
  const dataQuery = `
    SELECT id, user_id, form_type, form_json, created_at, updated_at, deleted_at
    FROM forms
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  try {
    const result = await pool.query(dataQuery, params);
    const forms = result.rows.map(mapRowToFormRecord);
    return { forms, total };
  } catch (error: any) {
    throw new DatabaseError(`Failed to get forms: ${error.message}`, error);
  }
}

/**
 * Update a form (only if not deleted and belongs to user)
 * @param pool - Database connection pool
 * @param id - Form ID
 * @param userId - User ID for authorization check
 * @param formJson - Updated form data
 * @returns Updated form record or null if not found
 */
export async function updateForm(
  pool: Pool,
  id: number,
  userId: string,
  formJson: Record<string, any>
): Promise<FormRecord | null> {
  const query = `
    UPDATE forms
    SET form_json = $1::jsonb, updated_at = CURRENT_TIMESTAMP
    WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
    RETURNING id, user_id, form_type, form_json, created_at, updated_at, deleted_at
  `;

  try {
    const result = await pool.query(query, [JSON.stringify(formJson), id, userId]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToFormRecord(result.rows[0]);
  } catch (error: any) {
    throw new DatabaseError(`Failed to update form: ${error.message}`, error);
  }
}

/**
 * Soft delete a form (only if belongs to user)
 * @param pool - Database connection pool
 * @param id - Form ID
 * @param userId - User ID for authorization check
 * @returns True if form was deleted, false if not found
 */
export async function deleteForm(pool: Pool, id: number, userId: string): Promise<boolean> {
  const query = `
    UPDATE forms
    SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
    RETURNING id
  `;

  try {
    const result = await pool.query(query, [id, userId]);
    return result.rows.length > 0;
  } catch (error: any) {
    throw new DatabaseError(`Failed to delete form: ${error.message}`, error);
  }
}

/**
 * Map database row to FormRecord type
 * Handles type conversion for dates and JSON
 * @param row - Database row
 * @returns FormRecord object
 */
function mapRowToFormRecord(row: any): FormRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    form_type: row.form_type,
    form_json: typeof row.form_json === "string" ? JSON.parse(row.form_json) : row.form_json,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}
