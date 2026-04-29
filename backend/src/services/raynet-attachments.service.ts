import type { Pool } from "pg";
import * as formsQueries from "../queries/forms.queries";
import * as formAttachmentsService from "./form-attachments.service";
import * as admfImageService from "./admf-image.service";
import * as customFormImageService from "./custom-form-image.service";

export type RaynetAttachmentSource =
  | { kind: "s3_form_attachment"; formId: number; s3Key: string; downloadPath: string }
  | { kind: "generated_admf_image"; formId: number }
  | { kind: "generated_custom_image"; formId: number; sourceFormId: number };

export interface RaynetAttachmentCandidate {
  source: RaynetAttachmentSource;
  filename: string;
  contentType: string;
  sizeBytes: number;
  buffer: Buffer;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Collect all attachment candidates for an ADMF form that should be uploaded to Raynet.
 *
 * Includes:
 * - S3/MinIO attachments uploaded by user
 * - Generated ADMF image
 * - Generated images for each source step-1 form referenced by admf.form_json.source_form_ids
 *
 * Does not perform any Raynet calls.
 */
export async function collectRaynetAttachmentCandidates(params: {
  pool: Pool;
  admfFormId: number;
  userId: string;
}): Promise<RaynetAttachmentCandidate[]> {
  const { pool, admfFormId, userId } = params;

  const admfForm = await formsQueries.getFormById(pool, admfFormId, userId);
  if (!admfForm) return [];

  const candidates: RaynetAttachmentCandidate[] = [];

  // 1) Uploaded S3/MinIO attachments for ADMF
  const list = await formAttachmentsService.listFormAttachments(pool, admfFormId, userId);
  for (const item of list) {
    const file = await formAttachmentsService.getFormAttachmentStream(pool, admfFormId, userId, item.key);
    const buffer = await streamToBuffer(file.stream);
    candidates.push({
      source: {
        kind: "s3_form_attachment",
        formId: admfFormId,
        s3Key: item.key,
        downloadPath: `/api/forms/${admfFormId}/attachments/file?key=${encodeURIComponent(item.key)}`,
      },
      filename: item.filename,
      contentType: file.contentType,
      sizeBytes: buffer.length,
      buffer,
    });
  }

  // 2) Generated ADMF image
  const admfImage = await admfImageService.generateAdmfImageBuffer(admfForm.form_json);
  candidates.push({
    source: { kind: "generated_admf_image", formId: admfFormId },
    filename: `admf-${admfFormId}.png`,
    contentType: "image/png",
    sizeBytes: admfImage.length,
    buffer: admfImage,
  });

  // 3) Generated images for source custom forms (výrobní list)
  const sourceFormIds: number[] = Array.isArray(admfForm.form_json?.source_form_ids)
    ? (admfForm.form_json.source_form_ids as number[])
    : [];

  for (const sourceFormId of sourceFormIds) {
    const src = await formsQueries.getFormById(pool, sourceFormId, userId);
    if (!src) continue;
    if (src.form_type !== "custom") continue;
    const image = await customFormImageService.generateCustomFormImageBuffer(src.form_json);
    candidates.push({
      source: { kind: "generated_custom_image", formId: admfFormId, sourceFormId },
      filename: `vyrobni-list-${sourceFormId}.png`,
      contentType: "image/png",
      sizeBytes: image.length,
      buffer: image,
    });
  }

  return candidates;
}
