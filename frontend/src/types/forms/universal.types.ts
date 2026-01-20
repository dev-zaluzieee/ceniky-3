/**
 * Type definitions for universal form
 * Shared between form page and parser
 */

/**
 * Entry row interface for window/blind entries
 */
export interface UniversalEntryRow {
  id: string;
  control: string;
  width: string;
  height: string;
  area: string;
  controlLength: string;
  frameColor: string;
  slat: string;
}

/**
 * Room interface - each room can have multiple entry rows
 */
export interface UniversalRoom {
  id: string;
  name: string;
  rows: UniversalEntryRow[];
}

/**
 * Form data interface for the installation documentation form
 */
export interface UniversalFormData {
  // Header section
  phone: string;
  address: string;
  city: string;
  product: string;
  supplier: string;
  productType: string;
  status: string;
  installationType: string;
  // Rooms with their entries
  rooms: UniversalRoom[];
  // Footer section
  ladder: string;
  ladderHeight: string;
  totalArea: string;
  slatVerified: string;
  // Raynet integration
  raynet_id?: number; // Linked Raynet customer ID
}
