"use client";

/**
 * ADMF form attachments: list, queue uploads (sequential + progress), delete.
 * Uploads only when formId exists (saved form).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  attachmentFileUrl,
  deleteFormAttachment,
  listFormAttachments,
  MAX_ATTACHMENTS_PER_FORM,
  MAX_ATTACHMENT_MB,
  uploadFormAttachment,
  type FormAttachmentItem,
} from "@/lib/form-attachments-api";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isPdf(filename: string): boolean {
  return filename.toLowerCase().endsWith(".pdf");
}

export interface FormAttachmentsSectionProps {
  /** Persisted form id; attachments disabled until set */
  formId?: number;
  /** Optional: scroll to / focus save area (element id on page) */
  saveSectionId?: string;
}

export default function FormAttachmentsSection({
  formId,
  saveSectionId = "admf-primary-save",
}: FormAttachmentsSectionProps) {
  const [items, setItems] = useState<FormAttachmentItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    if (formId == null) return;
    setListLoading(true);
    setListError(null);
    const res = await listFormAttachments(formId);
    setListLoading(false);
    if (!res.success) {
      setListError(res.error ?? "Chyba načtení");
      setItems([]);
      return;
    }
    setItems(res.data ?? []);
  }, [formId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const remainingSlots = Math.max(0, MAX_ATTACHMENTS_PER_FORM - items.length);
  const canAddMore = formId != null && remainingSlots > 0 && !uploading;

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || formId == null) return;
    const maxBytes = MAX_ATTACHMENT_MB * 1024 * 1024;
    const valid: File[] = [];
    for (const f of files) {
      if (f.size > maxBytes) {
        setUploadError(`Soubor „${f.name}“ překračuje ${MAX_ATTACHMENT_MB} MB.`);
        continue;
      }
      valid.push(f);
    }
    setUploadError(null);
    const cap = remainingSlots - pendingFiles.length;
    if (cap <= 0) {
      setUploadError(`Maximálně ${MAX_ATTACHMENTS_PER_FORM} souborů celkem.`);
      return;
    }
    setPendingFiles((prev) => [...prev, ...valid.slice(0, cap)]);
    if (valid.length > cap) {
      setUploadError(`Lze přidat ještě nejvýše ${cap} soubor(ů).`);
    }
  };

  const removePending = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const runUploads = async () => {
    if (formId == null || pendingFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const queue = [...pendingFiles];
    const total = queue.length;
    for (let i = 0; i < queue.length; i++) {
      setUploadProgress({ current: i + 1, total });
      const r = await uploadFormAttachment(formId, queue[i]);
      if (!r.success) {
        setUploadError(r.error ?? "Nahrání selhalo");
        setUploading(false);
        setUploadProgress(null);
        setPendingFiles(queue.slice(i));
        return;
      }
    }
    setPendingFiles([]);
    setUploadProgress(null);
    setUploading(false);
    await loadList();
  };

  const onDelete = async (key: string) => {
    if (formId == null || !confirm("Opravdu smazat tento soubor?")) return;
    setDeletingKey(key);
    const r = await deleteFormAttachment(formId, key);
    setDeletingKey(null);
    if (!r.success) {
      alert(r.error ?? "Smazání se nepodařilo");
      return;
    }
    await loadList();
  };

  const scrollToSave = () => {
    const el = document.getElementById(saveSectionId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (formId == null) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-5 text-sm text-amber-100">
        <p className="mb-3 font-medium text-amber-50">
          Před nahráním fotografií nebo PDF je třeba formulář uložit.
        </p>
        <button
          type="button"
          onClick={scrollToSave}
          className="min-h-[44px] rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Přejít k uložení
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Obrázky a PDF (max. {MAX_ATTACHMENT_MB} MB na soubor, nejvýše {MAX_ATTACHMENTS_PER_FORM}{" "}
        souborů).
      </p>

      {listError && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {listError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => loadList()}
          >
            Zkusit znovu
          </button>
        </div>
      )}

      {listLoading && items.length === 0 ? (
        <p className="text-sm text-zinc-500">Načítám přílohy…</p>
      ) : items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-3"
            >
              {isPdf(a.filename) ? (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-red-900/50 text-xs font-medium text-red-200">
                  PDF
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachmentFileUrl(formId, a.key)}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={attachmentFileUrl(formId, a.key)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm font-medium text-primary hover:underline"
                >
                  {a.filename}
                </a>
                <p className="text-xs text-zinc-500">{formatBytes(a.size)}</p>
              </div>
              <button
                type="button"
                disabled={deletingKey === a.key || uploading}
                onClick={() => onDelete(a.key)}
                className="min-h-[44px] shrink-0 rounded-lg border border-red-800/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/50 disabled:opacity-50"
              >
                {deletingKey === a.key ? "…" : "Smazat"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !listLoading && <p className="text-sm text-zinc-500">Zatím žádné přílohy.</p>
      )}

      <div className="rounded-lg border border-dashed border-zinc-600 bg-zinc-800/40 p-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          className="hidden"
          disabled={!canAddMore}
          onChange={onPickFiles}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canAddMore}
            onClick={() => inputRef.current?.click()}
            className="min-h-[44px] rounded-lg border border-zinc-500 bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Vybrat soubory / foto
          </button>
          <span className="text-sm text-zinc-500">
            Volné sloty: {remainingSlots - pendingFiles.length}
          </span>
        </div>

        {pendingFiles.length > 0 && (
          <div className="mt-4 border-t border-zinc-700 pt-4">
            <p className="mb-2 text-sm font-medium text-zinc-300">Ke nahrání ({pendingFiles.length})</p>
            <ul className="mb-3 space-y-1">
              {pendingFiles.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-2 text-sm text-zinc-400"
                >
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => removePending(i)}
                    className="shrink-0 text-primary hover:underline disabled:opacity-50"
                  >
                    Odebrat
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={uploading}
              onClick={runUploads}
              className="min-h-[44px] w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 sm:w-auto"
            >
              {uploading && uploadProgress
                ? `Nahrávám ${uploadProgress.current} / ${uploadProgress.total}…`
                : "Nahrát soubory"}
            </button>
          </div>
        )}

        {uploadError && (
          <p className="mt-2 text-sm text-red-400">{uploadError}</p>
        )}
      </div>
    </div>
  );
}
