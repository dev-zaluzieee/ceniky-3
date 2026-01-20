/**
 * Type definitions for plisé blinds form
 * Shared between form page and parser
 */

/**
 * Entry row interface for plisé blinds entries
 */
export interface PliseZaluzieEntryRow {
  id: string;
  handle: string; // Madlo - STANDARTNÍ (pro použití s ovládací tyč)
  width: string;
  height: string;
  area: string;
  mounting: string; // Uchycení - S / na rám / EXTRA
  frameColor: string;
  pliseType: string; // Typ plisé - STD / COMBI / PM1 / PM3 / PM5 / PS3
  coverStrip: string; // krycí lišta - NE / ANO = (mm)
  fabric1: string; // Látka 1
  fabric2: string; // Látka 2
}

/**
 * Room interface - each room can have multiple entry rows
 */
export interface PliseZaluzieRoom {
  id: string;
  name: string;
  rows: PliseZaluzieEntryRow[];
}

/**
 * Form data interface for plisé blinds form
 */
export interface PliseZaluzieFormData {
  // Header section
  name: string; // Customer name (firstName + lastName from Raynet)
  email: string; // Customer email
  phone: string;
  address: string;
  city: string;
  product: string;
  supplier: string;
  productType: string;
  controlRod: string; // Ovládací tyč - NE / ANO = ks
  controlRodLength: string; // délka ovládací tyče
  steelCable: string; // Ocelové lanko - ANO / NE
  status: string;
  installationType: string;
  glazingStripDepth: string; // Hloubka zasklívací lišty
  // Rooms with their entries
  rooms: PliseZaluzieRoom[];
  // Footer section
  ladder: string;
  ladderHeight: string;
  totalArea: string;
  fabricVerified: string; // Látka ověřena
  // Raynet integration
  raynet_id?: number; // Linked Raynet customer ID
}
