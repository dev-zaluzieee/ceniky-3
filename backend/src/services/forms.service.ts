/**
 * Service layer for forms business logic
 * Handles validation and coordinates between routes and queries
 */

import { Pool } from "pg";
import {
  FormType,
  FormRecord,
  CreateFormRequest,
  UpdateFormRequest,
  ListFormsQuery,
  PaginatedResponse,
} from "../types/forms.types";
import * as formsQueries from "../queries/forms.queries";
import { validateFormType, validateFormJson, validatePagination } from "../utils/validation";
import { NotFoundError } from "../utils/errors";

/**
 * Create a new form
 * @param pool - Database connection pool
 * @param userId - User ID
 * @param request - Form creation request
 * @returns Created form record
 */
export async function createForm(
  pool: Pool,
  userId: string,
  request: CreateFormRequest
): Promise<FormRecord> {
  // Validate form type
  validateFormType(request.form_type);

  // Validate form JSON
  validateFormJson(request.form_json);

  // Create form in database
  return await formsQueries.createForm(pool, userId, request.form_type, request.form_json);
}

/**
 * Get a form by ID
 * @param pool - Database connection pool
 * @param id - Form ID
 * @param userId - User ID for authorization
 * @returns Form record
 * @throws NotFoundError if form not found
 */
export async function getFormById(pool: Pool, id: number, userId: string): Promise<FormRecord> {
  const form = await formsQueries.getFormById(pool, id, userId);

  if (!form) {
    throw new NotFoundError("Form not found");
  }

  return form;
}

/**
 * Get paginated list of forms for a user
 * @param pool - Database connection pool
 * @param userId - User ID
 * @param query - Query parameters (form_type, page, limit)
 * @returns Paginated response with forms
 */
export async function getFormsByUserId(
  pool: Pool,
  userId: string,
  query: ListFormsQuery = {}
): Promise<PaginatedResponse<FormRecord>> {
  // Validate and normalize pagination
  const { page, limit } = validatePagination(query.page, query.limit);

  // Get forms from database
  const { forms, total } = await formsQueries.getFormsByUserId(pool, userId, {
    ...query,
    page,
    limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: forms,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Update a form
 * @param pool - Database connection pool
 * @param id - Form ID
 * @param userId - User ID for authorization
 * @param request - Form update request
 * @returns Updated form record
 * @throws NotFoundError if form not found
 */
export async function updateForm(
  pool: Pool,
  id: number,
  userId: string,
  request: UpdateFormRequest
): Promise<FormRecord> {
  // Validate form JSON
  validateFormJson(request.form_json);

  // Update form in database
  const form = await formsQueries.updateForm(pool, id, userId, request.form_json);

  if (!form) {
    throw new NotFoundError("Form not found");
  }

  return form;
}

/**
 * Delete a form (soft delete)
 * @param pool - Database connection pool
 * @param id - Form ID
 * @param userId - User ID for authorization
 * @throws NotFoundError if form not found
 */
export async function deleteForm(pool: Pool, id: number, userId: string): Promise<void> {
  const deleted = await formsQueries.deleteForm(pool, id, userId);

  if (!deleted) {
    throw new NotFoundError("Form not found");
  }
}
