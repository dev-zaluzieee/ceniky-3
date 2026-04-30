/**
 * Type definitions for the "Poslat na retence" pipeline.
 */

export type RetentionLogStatus =
  | "PENDING"
  | "SENDING"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED";

export type RetentionErrorCode =
  | "RETENCE_PRODUCTION_NOT_AVAILABLE"
  | "ORDER_NOT_FOUND"
  | "MISSING_RAYNET_ID"
  | "INVALID_REASON"
  | "RAYNET_GET_FAILED"
  | "RAYNET_AUTH_FAILED"
  | "RAYNET_VALIDATION_ERROR"
  | "RAYNET_SERVER_ERROR"
  | "RAYNET_TIMEOUT"
  | "RAYNET_UPDATE_FAILED"
  | "ERP_AUTH_FAILED"
  | "ERP_VALIDATION_ERROR"
  | "ERP_ORDER_LOCKED"
  | "ERP_TIMEOUT"
  | "ERP_SERVER_ERROR"
  | "ERP_CONFIG_MISSING"
  | "UNKNOWN_ERROR";

export type RetentionWarningCode =
  | "ERP_NOT_LINKED"
  | "ERP_PUT_FAILED"
  | "ERP_COMMENT_FAILED";

export interface RetentionWarning {
  code: string;
  field?: string;
  reason: string;
}

export interface RetentionLogRecord {
  id: number;
  order_id: number;
  user_id: string;
  reason: string;
  raynet_id: number;
  erp_order_id: number | null;
  status: RetentionLogStatus;
  test_mode: boolean;
  request_payload: Record<string, unknown> | null;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  error_message: string | null;
  error_code: string | null;
  warnings: RetentionWarning[] | null;
  duration_ms: number | null;
  created_at: Date;
  completed_at: Date | null;
}

export type RetentionLogKind = "OVT_REQUEST" | "OFFICE_EXPORT";

export interface CreateRetentionLogParams {
  order_id: number;
  user_id: string;
  reason: string;
  raynet_id: number;
  raynet_event_id: number;
  erp_order_id: number | null;
  test_mode: boolean;
  /** OVT_REQUEST = lightweight signal; OFFICE_EXPORT = full Raynet+ERP export. Defaults to OVT_REQUEST on the OVT side. */
  kind?: RetentionLogKind;
}

export interface UpdateRetentionLogParams {
  status?: RetentionLogStatus;
  request_payload?: Record<string, unknown>;
  response_status?: number;
  response_body?: Record<string, unknown>;
  error_message?: string;
  error_code?: RetentionErrorCode;
  warnings?: RetentionWarning[];
  duration_ms?: number;
  completed_at?: Date;
}

export interface SendRetentionRequest {
  reason?: unknown;
  testMode?: unknown;
}

export interface SendRetentionResponse {
  success: boolean;
  data?: {
    logId: number;
    status: RetentionLogStatus;
    testMode: boolean;
    submittedAt: string;
  };
  error?: string;
  code?: string;
}

export interface RetentionStatusResponse {
  success: boolean;
  data?: {
    inRetention: boolean;
    latest: {
      id: number;
      status: RetentionLogStatus;
      test_mode: boolean;
      reason: string;
      created_at: string;
      completed_at: string | null;
    } | null;
  };
  error?: string;
}
