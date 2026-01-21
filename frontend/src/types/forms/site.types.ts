/**
 * Type definitions for window/door screens form
 * Shared between form page and parser
 */

/**
 * Entry row interface for window/door screen entries
 */
export interface SiteEntryRow {
  id: string;
  hook: string; // Háček
  side: string; // Strana
  width: string;
  height: string;
  area: string;
  mesh: string; // Síťovina
  frameColor: string;
  hinges: string; // Panty - samo: ks, obyč: ks
  divider: string; // Předěl
  magneticStrip: string; // Mag. pásek / magnetky - ANO / NE: ks
  brush: string; // Štětinka - NE / M / V
  stripLength: string; // délka lišt / ostatní
}

/**
 * Room interface - each room can have multiple entry rows
 */
export interface SiteRoom {
  id: string;
  name: string;
  rows: SiteEntryRow[];
}

/**
 * Form data interface for window/door screens form
 */
export interface SiteFormData {
  // Header section
  name: string; // Customer name (firstName + lastName from Raynet)
  email: string; // Customer email
  phone: string;
  address: string;
  city: string;
  product: string;
  supplier: string;
  windowScreenType: string; // Typ okenní sítě
  doorScreenType: string; // Typ dveřní sítě
  status: string;
  installationType: string;
  renolit: string; // Renolit - NE / JEDNO / OBOU
  // Rooms with their entries
  rooms: SiteRoom[];
  // Footer section
  ladder: string;
  ladderHeight: string;
  totalArea: string;
  slatVerified: string;
  // Customer linking (Raynet + ERP)
  raynet_id?: number; // Linked Raynet customer ID
  erp_customer_id?: number; // Linked ERP customer ID (read-only replica)
}
