/**
 * Product extractors: turn step 1 form form_json into product lines for ADMF.
 * One extractor per form type; each returns array of { produkt, ks, ram?, lamelaLatka? }
 * (price is added by extract-products service via pricing service).
 */

import type { FormType } from "../types/forms.types";
import type { ExtractedProductLine } from "../types/extract-products.types";
import { getPriceForProduct } from "./pricing.service";

/** Product line before price (extractor output); price added by service */
export type ProductLineWithoutPrice = Omit<ExtractedProductLine, "cena" | "sleva" | "cenaPoSleve">;

function addPrice(line: ProductLineWithoutPrice): ExtractedProductLine {
  const cena = getPriceForProduct(line);
  const sleva = 0;
  const cenaPoSleve = Math.round(cena * (1 - sleva / 100));
  return { ...line, cena, sleva, cenaPoSleve };
}

/** Horizontalni zaluzie: rooms with rows → one product per row (productType, slatType, width x height) */
export function extractFromHorizontalniZaluzie(formJson: Record<string, any>): ProductLineWithoutPrice[] {
  const rooms = formJson?.rooms as Array<{ name?: string; rows?: Array<Record<string, any>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const lines: ProductLineWithoutPrice[] = [];
  const productType = formJson.productType || "";
  const slatType = formJson.slatType || "";

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = row.width ?? "";
      const height = row.height ?? "";
      const area = row.area ?? "";
      const produkt = ["Horizontální žaluzie", productType, slatType, [width, height].filter(Boolean).join("×") || area]
        .filter(Boolean)
        .join(" - ");
      lines.push({
        produkt: produkt || "Horizontální žaluzie",
        ks: 1,
        ram: row.frameColor ?? "",
        lamelaLatka: row.slat ?? "",
      });
    }
  }
  return lines;
}

/** Plise zaluzie: rooms with rows → one product per row */
export function extractFromPliseZaluzie(formJson: Record<string, any>): ProductLineWithoutPrice[] {
  const rooms = formJson?.rooms as Array<{ name?: string; rows?: Array<Record<string, any>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const lines: ProductLineWithoutPrice[] = [];
  const productType = formJson.productType || "";

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = row.width ?? "";
      const height = row.height ?? "";
      const pliseType = row.pliseType ?? "";
      const produkt = ["Plisé žaluzie", productType, pliseType, [width, height].filter(Boolean).join("×")]
        .filter(Boolean)
        .join(" - ");
      lines.push({
        produkt: produkt || "Plisé žaluzie",
        ks: 1,
        ram: row.frameColor ?? "",
        lamelaLatka: [row.fabric1, row.fabric2].filter(Boolean).join(" / ") || "",
      });
    }
  }
  return lines;
}

/** Site (okenní/dveřní sítě): rooms with rows */
export function extractFromSite(formJson: Record<string, any>): ProductLineWithoutPrice[] {
  const rooms = formJson?.rooms as Array<{ name?: string; rows?: Array<Record<string, any>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const lines: ProductLineWithoutPrice[] = [];
  const windowType = formJson.windowScreenType || "";
  const doorType = formJson.doorScreenType || "";

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = row.width ?? "";
      const height = row.height ?? "";
      const mesh = row.mesh ?? "";
      const produkt = ["Okenní/dveřní sítě", windowType || doorType, mesh, [width, height].filter(Boolean).join("×")]
        .filter(Boolean)
        .join(" - ");
      lines.push({
        produkt: produkt || "Okenní/dveřní sítě",
        ks: 1,
        ram: row.frameColor ?? "",
        lamelaLatka: mesh || "",
      });
    }
  }
  return lines;
}

/** Textile rolety: rooms with rows */
export function extractFromTextileRolety(formJson: Record<string, any>): ProductLineWithoutPrice[] {
  const rooms = formJson?.rooms as Array<{ name?: string; rows?: Array<Record<string, any>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const lines: ProductLineWithoutPrice[] = [];
  const productType = formJson.productType || "";

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = row.width ?? "";
      const height = row.height ?? "";
      const fabric = row.fabricColor ?? row.fabric ?? row.latka ?? "";
      const produkt = ["Textilní rolety", productType, [width, height].filter(Boolean).join("×")]
        .filter(Boolean)
        .join(" - ");
      lines.push({
        produkt: produkt || "Textilní rolety",
        ks: 1,
        ram: row.frameColor ?? "",
        lamelaLatka: fabric || "",
      });
    }
  }
  return lines;
}

/** Universal: rooms with rows */
export function extractFromUniversal(formJson: Record<string, any>): ProductLineWithoutPrice[] {
  const rooms = formJson?.rooms as Array<{ name?: string; rows?: Array<Record<string, any>> }> | undefined;
  if (!Array.isArray(rooms)) return [];

  const lines: ProductLineWithoutPrice[] = [];
  const productType = formJson.productType || "";

  for (const room of rooms) {
    const rows = room?.rows;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const width = row.width ?? "";
      const height = row.height ?? "";
      const produkt = ["Univerzální", productType, [width, height].filter(Boolean).join("×")]
        .filter(Boolean)
        .join(" - ");
      lines.push({
        produkt: produkt || "Univerzální list",
        ks: 1,
        ram: row.frameColor ?? "",
        lamelaLatka: row.slat ?? "",
      });
    }
  }
  return lines;
}

/** Run extractor for given form type and add mocked prices */
export function extractProductsFromForm(
  formType: FormType,
  formJson: Record<string, any>
): ExtractedProductLine[] {
  let raw: ProductLineWithoutPrice[] = [];
  switch (formType) {
    case "horizontalni-zaluzie":
      raw = extractFromHorizontalniZaluzie(formJson);
      break;
    case "plise-zaluzie":
      raw = extractFromPliseZaluzie(formJson);
      break;
    case "site":
      raw = extractFromSite(formJson);
      break;
    case "textile-rolety":
      raw = extractFromTextileRolety(formJson);
      break;
    case "universal":
      raw = extractFromUniversal(formJson);
      break;
    default:
      return [];
  }
  return raw.map(addPrice);
}
