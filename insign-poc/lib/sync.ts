/**
 * Pull latest status from inSign and reconcile our DB row.
 * Used by the status route + the webhook handler so both code paths converge.
 */

import { checkStatus, getStatus, downloadDocuments, getAuditJson } from "./insign-client";
import {
  getSessionById,
  getSessionByInsignId,
  storeSignedDocument,
  updateSessionStatus,
  type SessionRow,
} from "./db";

export interface SyncResult {
  session: SessionRow;
  check: Awaited<ReturnType<typeof checkStatus>>;
  status: Awaited<ReturnType<typeof getStatus>>;
}

export async function syncSessionStatus(sessionId: string): Promise<SyncResult> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  return reconcileFromInsign(session);
}

export async function syncByInsignSessionId(insignSessionId: string): Promise<SyncResult | null> {
  const session = await getSessionByInsignId(insignSessionId);
  if (!session) return null;
  return reconcileFromInsign(session);
}

async function reconcileFromInsign(session: SessionRow): Promise<SyncResult> {
  const [check, status] = await Promise.all([
    checkStatus(session.insign_session_id),
    getStatus(session.insign_session_id),
  ]);

  const completed = !!status.sucessfullyCompleted || !!check.completed;
  const justCompleted = completed && !session.completed;

  await updateSessionStatus(session.id, {
    status: completed ? "completed" : check.processStep || session.status,
    processStep: check.processStep ?? null,
    completed,
    gdprDeclined: !!status.gdprDeclined,
    lastStatusJson: { check, status },
    completedAt: justCompleted ? new Date() : undefined,
  });

  if (justCompleted) {
    await fetchAndStoreArtifacts(session.id, session.insign_session_id);
  }

  const refreshed = await getSessionById(session.id);
  return { session: refreshed ?? session, check, status };
}

async function fetchAndStoreArtifacts(sessionId: string, insignSessionId: string): Promise<void> {
  try {
    const dl = await downloadDocuments(insignSessionId, { auditreport: true, incBioData: true });
    const kind = dl.contentType.includes("zip")
      ? "archive_zip"
      : dl.contentType.includes("pdf")
        ? "document"
        : "archive_zip";
    await storeSignedDocument({
      sessionId,
      kind,
      filename: dl.filename,
      contentType: dl.contentType,
      data: dl.bytes,
    });
  } catch (e) {
    console.error("[insign] downloadDocuments failed", e);
  }

  try {
    const audit = await getAuditJson(insignSessionId);
    const json = JSON.stringify(audit, null, 2);
    await storeSignedDocument({
      sessionId,
      kind: "audit_json",
      filename: `audit-${insignSessionId}.json`,
      contentType: "application/json",
      data: new TextEncoder().encode(json),
    });
  } catch (e) {
    console.error("[insign] getAuditJson failed", e);
  }
}
