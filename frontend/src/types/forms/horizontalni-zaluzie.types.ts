/**
 * Type definitions for horizontal blinds form
 * Shared between form page and parser
 */

/**
 * Entry row interface for horizontal blind entries
 */
export interface HorizontalniZaluzieEntryRow {
  id: string;
  control: string; // Ovládání - L / P
  width: string;
  height: string;
  area: string;
  chain: string; // Řetízek
  equipment: string; // Výbava - ne / B / NP
  bp: string; // BP - A / N
  pad: string; // Podložka - ks / N
  fixation: string; // Fixace / bez silonu - S / PVC / KOV / ČERVÍK
  mounting: string; // Uchycení - S / SR30 / SR30/1
  frameColor: string;
  slat: string; // Lamela
}

/**
 * Room interface - each room can have multiple entry rows
 */
export interface HorizontalniZaluzieRoom {
  id: string;
  name: string;
  rows: HorizontalniZaluzieEntryRow[];
}

/**
 * Form data interface for horizontal blinds form
 */
export interface HorizontalniZaluzieFormData {
  // Header section
  name: string; // Customer name (firstName + lastName from Raynet)
  email: string; // Customer email
  phone: string;
  address: string;
  city: string;
  product: string;
  supplier: string;
  productType: string; // Typ produktu
  slatType: string; // Lamela - 25x0,18 / 25x0,21 / 16x0,21
  status: string;
  installationType: string;
  glazingStripDepth: string; // Hloubka zasklívací lišty
  // Rooms with their entries
  rooms: HorizontalniZaluzieRoom[];
  // Footer section
  ladder: string;
  ladderHeight: string;
  totalArea: string;
  totalCount: string; // Celkem: ks
  slatVerified: string;
  // Raynet integration
  raynet_id?: number; // Linked Raynet customer ID
}
