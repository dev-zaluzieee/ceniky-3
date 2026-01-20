/**
 * Type definitions for textile/D&N blinds form
 * Shared between form page and parser
 */

/**
 * Entry row interface for textile/D&N blind entries
 */
export interface TextileRoletyEntryRow {
  id: string;
  control: string; // L / P
  width: string;
  height: string;
  area: string;
  strip: string; // Lišta
  chain: string; // Řetízek
  bp: string; // A / N
  mountingLocation: string; // zas. / rám / strop / zeď
  colleteType: string; // plus / XL
  jazzWinding: string; // ke zdi / od zdi
  jazzMountingProfile: string; // ANO / NE
  frameColor: string;
  fabricColor: string;
}

/**
 * Room interface - each room can have multiple entry rows
 */
export interface TextileRoletyRoom {
  id: string;
  name: string;
  rows: TextileRoletyEntryRow[];
}

/**
 * Form data interface for textile/D&N blinds form
 */
export interface TextileRoletyFormData {
  // Header section
  name: string; // Customer name (firstName + lastName from Raynet)
  email: string; // Customer email
  phone: string;
  address: string;
  city: string;
  product: string;
  supplier: string;
  productType: string;
  status: string;
  installationType: string;
  glazingStripDepth: string; // Hloubka zasklívací lišty
  // Rooms with their entries
  rooms: TextileRoletyRoom[];
  // Footer section
  ladder: string;
  ladderHeight: string;
  totalArea: string;
  slatVerified: string;
  // Raynet integration
  raynet_id?: number; // Linked Raynet customer ID
}
