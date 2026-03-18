/**
 * Handlers for ADMF form attachments (S3/MinIO). Wired from forms.routes.
 */

import type { Response } from "express";
import multer from "multer";
import { getPool } from "../config/database";
import { MAX_ATTACHMENT_BYTES } from "../config/form-attachments.constants";
import * as formAttachmentsService from "../services/form-attachments.service";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { ApiError } from "../utils/errors";

/** Multer: single file in memory, size cap */
export const formAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
});

function parseFormId(req: AuthenticatedRequest): number {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(String(raw), 10);
  if (Number.isNaN(id) || id < 1) {
    throw new ApiError(400, "Neplatné ID formuláře", "INVALID_FORM_ID");
  }
  return id;
}

export async function listFormAttachmentsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const pool = getPool();
  const formId = parseFormId(req);
  const items = await formAttachmentsService.listFormAttachments(
    pool,
    formId,
    req.userId!
  );
  // Prevent CDN/browser caching stale list after uploads (production)
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.json({ success: true, data: items });
}

export async function uploadFormAttachmentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const pool = getPool();
  const formId = parseFormId(req);
  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({
      success: false,
      error: "Chybí soubor (pole file)",
      code: "MISSING_FILE",
    });
    return;
  }
  const item = await formAttachmentsService.uploadFormAttachment(
    pool,
    formId,
    req.userId!,
    file.buffer,
    file.originalname || "upload",
    file.mimetype
  );
  res.status(201).json({ success: true, data: item });
}

export async function deleteFormAttachmentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const pool = getPool();
  const formId = parseFormId(req);
  const key = typeof req.query.key === "string" ? decodeURIComponent(req.query.key) : "";
  if (!key) {
    res.status(400).json({
      success: false,
      error: "Chybí parametr key",
      code: "MISSING_KEY",
    });
    return;
  }
  await formAttachmentsService.deleteFormAttachment(pool, formId, req.userId!, key);
  res.json({ success: true });
}

export async function getFormAttachmentFileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const pool = getPool();
  const formId = parseFormId(req);
  const key = typeof req.query.key === "string" ? decodeURIComponent(req.query.key) : "";
  if (!key) {
    res.status(400).json({
      success: false,
      error: "Chybí parametr key",
      code: "MISSING_KEY",
    });
    return;
  }
  try {
    const { stream, contentType, contentLength } =
      await formAttachmentsService.getFormAttachmentStream(
        pool,
        formId,
        req.userId!,
        key
      );
    res.setHeader("Content-Type", contentType);
    if (contentLength != null) {
      res.setHeader("Content-Length", String(contentLength));
    }
    res.setHeader(
      "Content-Disposition",
      "inline; filename*=UTF-8''" + encodeURIComponent(key.split("/").pop() || "file")
    );
    stream.pipe(res);
  } catch (err: unknown) {
    const n = (err as { name?: string })?.name;
    if (n === "NoSuchKey" || n === "NotFound") {
      res.status(404).json({ success: false, error: "Soubor nenalezen" });
      return;
    }
    throw err;
  }
}

export function multerErrorHandler(err: unknown, res: Response): boolean {
  if (err && typeof err === "object" && "code" in err && (err as multer.MulterError).code === "LIMIT_FILE_SIZE") {
    res.status(400).json({
      success: false,
      error: `Soubor je větší než ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`,
      code: "FILE_TOO_LARGE",
    });
    return true;
  }
  return false;
}
