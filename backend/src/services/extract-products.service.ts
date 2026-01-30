/**
 * Service: extract products from step 1 forms for an order (to prefill ADMF).
 * Returns product lines with mocked prices and source form IDs for hover highlight.
 * Optional formIds: if provided, only those forms are used (must belong to order and be step 1).
 */

import { Pool } from "pg";
import * as formsQueries from "../queries/forms.queries";
import * as ordersQueries from "../queries/orders.queries";
import { STEP1_FORM_TYPES } from "../types/forms.types";
import type { FormType } from "../types/forms.types";
import type { ExtractProductsResponse, ExtractedProductLine } from "../types/extract-products.types";
import { extractProductsFromForm } from "./product-extractors";
import { NotFoundError, BadRequestError } from "../utils/errors";

/**
 * Extract products from step 1 forms for the order.
 * If formIds is provided, only those forms are used (must belong to order and be step 1).
 * @param pool - Database connection pool
 * @param orderId - Order ID
 * @param userId - User ID for auth
 * @param formIds - Optional: only extract from these form IDs (must be step 1 and belong to order)
 */
export async function extractProductsForOrder(
  pool: Pool,
  orderId: number,
  userId: string,
  formIds?: number[]
): Promise<ExtractProductsResponse> {
  const order = await ordersQueries.getOrderById(pool, orderId, userId);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  let formsToUse: Awaited<ReturnType<typeof formsQueries.getFormsByUserId>>["forms"];

  if (formIds != null && formIds.length > 0) {
    const { forms } = await formsQueries.getFormsByUserId(pool, userId, {
      order_id: orderId,
      limit: 500,
    });
    const idSet = new Set(formIds);
    formsToUse = forms.filter(
      (f) => idSet.has(f.id) && f.order_id === orderId && STEP1_FORM_TYPES.includes(f.form_type as FormType)
    );
    if (formsToUse.length !== formIds.length) {
      throw new BadRequestError("Some form IDs are invalid or not step 1 forms of this order", "INVALID_FORM_IDS");
    }
  } else {
    const { forms } = await formsQueries.getFormsByUserId(pool, userId, {
      order_id: orderId,
      limit: 500,
    });
    formsToUse = forms.filter((f) => STEP1_FORM_TYPES.includes(f.form_type as FormType));
  }

  const products: ExtractedProductLine[] = [];
  const sourceFormIds: number[] = [];

  for (const form of formsToUse) {
    const formType = form.form_type as FormType;
    const lines = extractProductsFromForm(formType, form.form_json);
    if (lines.length > 0) {
      products.push(...lines);
      sourceFormIds.push(form.id);
    }
  }

  return { products, source_form_ids: sourceFormIds };
}
