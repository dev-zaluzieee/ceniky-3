/**
 * Client-side helpers for the "Poslat na retence" pipeline.
 */

export type RetentionLogStatus =
  | "PENDING"
  | "SENDING"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED";

export interface RetentionStatusLatest {
  id: number;
  status: RetentionLogStatus;
  test_mode: boolean;
  reason: string;
  created_at: string;
  completed_at: string | null;
}

export interface RetentionStatus {
  inRetention: boolean;
  latest: RetentionStatusLatest | null;
}

export interface RetentionApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export async function getRetentionStatus(
  orderId: number
): Promise<RetentionApiResult<RetentionStatus>> {
  try {
    const res = await fetch(`/api/retention/orders/${orderId}/status`, {
      method: "GET",
      credentials: "include",
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error ?? "Nepodařilo se načíst stav retencí.", code: json.code };
    }
    return { success: true, data: json.data as RetentionStatus };
  } catch {
    return { success: false, error: "Nepodařilo se načíst stav retencí." };
  }
}

export async function sendOrderToRetention(params: {
  orderId: number;
  reason: string;
  testMode: boolean;
}): Promise<RetentionApiResult<{ logId: number; status: RetentionLogStatus; submittedAt: string }>> {
  try {
    const res = await fetch(`/api/retention/orders/${params.orderId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason: params.reason, testMode: params.testMode }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error ?? "Odeslání selhalo.", code: json.code };
    }
    return { success: true, data: json.data };
  } catch {
    return { success: false, error: "Odeslání selhalo." };
  }
}
