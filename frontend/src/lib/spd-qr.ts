/**
 * Build a Short Payment Descriptor (SPD) string for Czech QR payment codes.
 * Spec: https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */

export interface SpdParams {
  /** IBAN account number (no spaces) */
  account: string;
  /** Amount in CZK */
  amount: number;
  /** Variable symbol */
  variableSymbol: number;
  /** Payment message (optional, max 60 chars) */
  message?: string;
}

export function buildSpdString(params: SpdParams): string {
  const parts = [
    "SPD*1.0",
    `ACC:${params.account}`,
    `AM:${params.amount.toFixed(2)}`,
    "CC:CZK",
    `X-VS:${params.variableSymbol}`,
  ];
  if (params.message) {
    parts.push(`MSG:${params.message.slice(0, 60)}`);
  }
  return parts.join("*");
}

/** Format IBAN with spaces every 4 chars for display */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
