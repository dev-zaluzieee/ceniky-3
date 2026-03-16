/**
 * Service layer for ERP order lookups.
 */

import { BadRequestError } from "../utils/errors";
import * as erpOrdersQueries from "../queries/erp-orders.queries";
import { ErpOrder } from "../types/erp.types";

/**
 * Get ERP orders for a given customer ID.
 * @param customerId - ERP customer id (must be a positive integer)
 */
export async function getOrdersByCustomerId(customerId: number): Promise<ErpOrder[]> {
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new BadRequestError("Invalid customer ID");
  }

  return erpOrdersQueries.getErpOrdersByCustomerId(customerId);
}
