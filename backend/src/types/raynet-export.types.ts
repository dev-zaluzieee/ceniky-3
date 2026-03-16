/**
 * Type definitions for Raynet export pipeline
 */

export type ExportLogStatus = "PENDING" | "MAPPING" | "SENDING" | "SUCCESS" | "FAILED";

export type ExportErrorCode =
  | "MISSING_EVENT_ID"
  | "FORM_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "MAPPING_ERROR"
  | "RAYNET_AUTH_FAILED"
  | "RAYNET_VALIDATION_ERROR"
  | "RAYNET_TIMEOUT"
  | "RAYNET_SERVER_ERROR"
  | "RAYNET_CONFIG_MISSING"
  | "UNKNOWN_ERROR";

export interface ExportWarning {
  code: "FIELD_SKIPPED" | "FIELD_TRUNCATED" | "FIELD_EMPTY" | "ENUM_MISMATCH";
  field: string;
  reason: string;
}

export interface ExportLogRecord {
  id: number;
  form_id: number;
  order_id: number;
  raynet_event_id: number;
  user_id: string;
  status: ExportLogStatus;
  test_mode: boolean;
  request_payload: Record<string, unknown> | null;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  error_message: string | null;
  error_code: string | null;
  warnings: ExportWarning[] | null;
  duration_ms: number | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface CreateExportLogParams {
  form_id: number;
  order_id: number;
  raynet_event_id: number;
  user_id: string;
  test_mode: boolean;
  export_batch_id?: string;
}

export interface UpdateExportLogParams {
  status?: ExportLogStatus;
  request_payload?: Record<string, unknown>;
  response_status?: number;
  response_body?: Record<string, unknown>;
  error_message?: string;
  error_code?: ExportErrorCode;
  warnings?: ExportWarning[];
  duration_ms?: number;
  completed_at?: Date;
}

/** The Raynet event update payload we build from ADMF data */
export interface RaynetEventUpdatePayload {
  category: number;
  status: string;
  customFields: Record<string, unknown>;
}

export interface ExportRaynetRequest {
  testMode?: boolean;
}

export interface ExportRaynetResponse {
  success: boolean;
  data?: {
    logId: number;
    exportedAt: string;
    testMode: boolean;
    warnings: ExportWarning[];
  };
  error?: string;
}
