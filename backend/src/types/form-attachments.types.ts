/**
 * Attachment metadata returned to the client (no DB; listed from object storage).
 */
export interface FormAttachmentItem {
  /** Full object key in bucket */
  key: string;
  /** Display name (filename part) */
  filename: string;
  size: number;
  lastModified: string;
}
