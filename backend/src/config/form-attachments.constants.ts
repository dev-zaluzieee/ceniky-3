/**
 * ADMF form attachments stored in object storage (MinIO / S3-compatible).
 * Keys: admf-forms/{formId}/{uuid}.{ext}
 */

/** Max file size per upload (25 MB). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Max objects per form (prefix). */
export const MAX_ATTACHMENTS_PER_FORM = 20;

/** Allowed extensions (lowercase, includes dot). */
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
]);

/** Object key prefix for one form. */
export function formAttachmentsPrefix(formId: number): string {
  return `admf-forms/${formId}/`;
}
