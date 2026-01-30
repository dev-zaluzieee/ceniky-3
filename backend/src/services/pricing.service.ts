/**
 * Pricing service – returns price for a product line.
 * MOCK IMPLEMENTATION: In the future this will call an external pricing API.
 * Until then we return a random value between 500 and 10000 for development/testing.
 */

import type { ExtractedProductLine } from "../types/extract-products.types";

/**
 * Get unit price for a product line.
 * MOCK: Returns random number 500–10000. Replace with real API call when available.
 */
export function getPriceForProduct(_product: Omit<ExtractedProductLine, "cena" | "sleva" | "cenaPoSleve">): number {
  // MOCK: Random price for development. Replace with external pricing API call.
  const MIN_MOCK_PRICE = 500;
  const MAX_MOCK_PRICE = 10000;
  return Math.floor(Math.random() * (MAX_MOCK_PRICE - MIN_MOCK_PRICE + 1)) + MIN_MOCK_PRICE;
}
