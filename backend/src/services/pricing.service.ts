/**
 * Pricing service – returns price for a product line.
 * Price must be provided by the form schema (e.g. schema.pricing.dimension_grid.prices).
 * This module throws when no price is available; there is no fallback or mock.
 */

import type { ExtractedProductLine } from "../types/extract-products.types";

/**
 * Get unit price for a product line.
 * Throws if price cannot be determined – no mock or random values.
 * Callers must obtain price from schema (e.g. dimension grid) before calling;
 * in practice, do not call this when schema price is missing; throw a clear error instead.
 */
export function getPriceForProduct(
  product: Omit<ExtractedProductLine, "cena" | "sleva" | "cenaPoSleve">
): number {
  throw new Error(
    `Price not available for product "${product.produkt}". ` +
      "Pricing must be provided in the form schema (e.g. schema.pricing.dimension_grid.prices). " +
      "Do not use mock or random prices."
  );
}
