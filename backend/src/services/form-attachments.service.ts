/**
 * Form attachments: list, upload, delete, stream from S3/MinIO.
 * Business rules: ADMF only, prefix per form, count/size limits.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import type { Pool } from "pg";
import { getS3StorageConfig } from "../config/s3-storage.client";
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_FORM,
  formAttachmentsPrefix,
} from "../config/form-attachments.constants";
import {
  BadRequestError,
  NotFoundError,
  ServiceUnavailableError,
} from "../utils/errors";
import * as formsService from "./forms.service";
import type { FormAttachmentItem } from "../types/form-attachments.types";

function extensionFromOriginalName(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
}

function assertKeyBelongsToForm(formId: number, key: string): void {
  const prefix = formAttachmentsPrefix(formId);
  if (!key.startsWith(prefix) || key.length <= prefix.length) {
    throw new BadRequestError("Invalid attachment key", "INVALID_ATTACHMENT_KEY");
  }
  if (key.includes("..") || key.includes("//")) {
    throw new BadRequestError("Invalid attachment key", "INVALID_ATTACHMENT_KEY");
  }
}

async function ensureAdmfForm(pool: Pool, formId: number, userId: string): Promise<void> {
  const form = await formsService.getFormById(pool, formId, userId);
  if (form.form_type !== "admf") {
    throw new BadRequestError("Attachments are only allowed for ADMF forms", "NOT_ADMF_FORM");
  }
}

function requireStorage() {
  const cfg = getS3StorageConfig();
  if (!cfg) {
    throw new ServiceUnavailableError(
      "Úložiště souborů není nakonfigurováno (S3 / MinIO).",
      "STORAGE_NOT_CONFIGURED"
    );
  }
  return cfg;
}

/** Count objects under prefix (cheap check: max 21 keys for upload gate). */
async function countAttachmentObjects(formId: number): Promise<number> {
  const cfg = requireStorage();
  const prefix = formAttachmentsPrefix(formId);
  let n = 0;
  let token: string | undefined;
  do {
    const res = await cfg.client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        MaxKeys: 100,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents ?? []) {
      if (o.Key && !o.Key.endsWith("/")) n++;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return n;
}

/**
 * List attachments under the form prefix (newest first by lastModified).
 */
export async function listFormAttachments(
  pool: Pool,
  formId: number,
  userId: string
): Promise<FormAttachmentItem[]> {
  await ensureAdmfForm(pool, formId, userId);
  const cfg = requireStorage();
  const prefix = formAttachmentsPrefix(formId);
  const out: FormAttachmentItem[] = [];
  let token: string | undefined;
  do {
    const res = await cfg.client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key || o.Key.endsWith("/")) continue;
      const filename = o.Key.slice(prefix.length) || o.Key;
      out.push({
        key: o.Key,
        filename,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? new Date(0).toISOString(),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  out.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1));
  return out;
}

/**
 * Upload one file; enforces count and size limits.
 */
export async function uploadFormAttachment(
  pool: Pool,
  formId: number,
  userId: string,
  buffer: Buffer,
  originalFilename: string,
  contentType: string | undefined
): Promise<FormAttachmentItem> {
  await ensureAdmfForm(pool, formId, userId);
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestError(
      `Soubor je větší než ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
      "FILE_TOO_LARGE"
    );
  }
  const ext = extensionFromOriginalName(originalFilename);
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
    throw new BadRequestError(
      "Povolené typy: obrázky (JPG, PNG, …) a PDF",
      "INVALID_FILE_TYPE"
    );
  }
  const count = await countAttachmentObjects(formId);
  if (count >= MAX_ATTACHMENTS_PER_FORM) {
    throw new BadRequestError(
      `Maximálně ${MAX_ATTACHMENTS_PER_FORM} souborů na formulář`,
      "TOO_MANY_ATTACHMENTS"
    );
  }
  const cfg = requireStorage();
  const prefix = formAttachmentsPrefix(formId);
  const key = `${prefix}${randomUUID()}${ext}`;
  await cfg.client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );
  return {
    key,
    filename: key.slice(prefix.length),
    size: buffer.length,
    lastModified: new Date().toISOString(),
  };
}

export async function deleteFormAttachment(
  pool: Pool,
  formId: number,
  userId: string,
  objectKey: string
): Promise<void> {
  await ensureAdmfForm(pool, formId, userId);
  assertKeyBelongsToForm(formId, objectKey);
  const cfg = requireStorage();
  await cfg.client.send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: objectKey })
  );
}

/**
 * Stream object for proxy download; caller must handle NotFound from S3.
 */
export async function getFormAttachmentStream(
  pool: Pool,
  formId: number,
  userId: string,
  objectKey: string
): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
  await ensureAdmfForm(pool, formId, userId);
  assertKeyBelongsToForm(formId, objectKey);
  const cfg = requireStorage();
  const res = await cfg.client.send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey })
  );
  if (!res.Body) {
    throw new NotFoundError("Soubor nenalezen");
  }
  return {
    stream: res.Body as Readable,
    contentType: res.ContentType || "application/octet-stream",
    contentLength: res.ContentLength,
  };
}
