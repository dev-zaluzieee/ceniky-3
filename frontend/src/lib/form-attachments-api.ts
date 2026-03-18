/**
 * Client API for ADMF form attachments (proxied via Next.js to backend / MinIO).
 */

export const MAX_ATTACHMENTS_PER_FORM = 20;
export const MAX_ATTACHMENT_MB = 25;

export interface FormAttachmentItem {
  key: string;
  filename: string;
  size: number;
  lastModified: string;
}

export interface ListAttachmentsResult {
  success: boolean;
  data?: FormAttachmentItem[];
  error?: string;
  code?: string;
}

/** Browser URL for viewing/downloading (authenticated cookie session). */
export function attachmentFileUrl(formId: number, key: string): string {
  return `/api/forms/${formId}/attachments/file?key=${encodeURIComponent(key)}`;
}

export async function listFormAttachments(formId: number): Promise<ListAttachmentsResult> {
  try {
    const res = await fetch(`/api/forms/${formId}/attachments`, {
      method: "GET",
      credentials: "include",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: json.error || "Nepodařilo se načíst přílohy",
        code: json.code,
      };
    }
    return { success: true, data: json.data ?? [] };
  } catch {
    return { success: false, error: "Síťová chyba" };
  }
}

export async function uploadFormAttachment(
  formId: number,
  file: File
): Promise<{ success: boolean; data?: FormAttachmentItem; error?: string; code?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/forms/${formId}/attachments`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: json.error || "Nahrání se nepodařilo",
        code: json.code,
      };
    }
    return { success: true, data: json.data };
  } catch {
    return { success: false, error: "Síťová chyba" };
  }
}

export async function deleteFormAttachment(
  formId: number,
  key: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `/api/forms/${formId}/attachments?key=${encodeURIComponent(key)}`,
      { method: "DELETE", credentials: "include" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: json.error || "Smazání se nepodařilo" };
    }
    return { success: true };
  } catch {
    return { success: false, error: "Síťová chyba" };
  }
}
