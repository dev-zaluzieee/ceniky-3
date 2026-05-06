import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __insignPocPool: Pool | undefined;
}

function getPool(): Pool {
  if (!globalThis.__insignPocPool) {
    globalThis.__insignPocPool = new Pool({
      connectionString: env.database.url(),
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__insignPocPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never[]);
  return res.rows;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------- domain helpers ----------

export type DeliveryMode = "inapp" | "extern";

export interface SessionRow {
  id: string;
  insign_session_id: string;
  displayname: string;
  foruser: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  mediator_name: string | null;
  mediator_email: string | null;
  delivery_mode: DeliveryMode;
  access_url: string | null;
  extern_links_json: unknown;
  status: string;
  last_status_json: unknown;
  process_step: string | null;
  completed: boolean;
  rejected: boolean;
  gdpr_declined: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  rejected_at: string | null;
}

export async function insertSession(r: {
  insignSessionId: string;
  displayname: string;
  foruser: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  mediatorName: string;
  mediatorEmail: string | null;
  deliveryMode: DeliveryMode;
  accessUrl: string | null;
}): Promise<SessionRow> {
  const rows = await query<SessionRow>(
    `INSERT INTO sessions
       (insign_session_id, displayname, foruser, customer_name, customer_email,
        customer_phone, mediator_name, mediator_email, delivery_mode, access_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'created')
     RETURNING *`,
    [
      r.insignSessionId,
      r.displayname,
      r.foruser,
      r.customerName,
      r.customerEmail,
      r.customerPhone,
      r.mediatorName,
      r.mediatorEmail,
      r.deliveryMode,
      r.accessUrl,
    ]
  );
  return rows[0]!;
}

export async function listSessions(): Promise<SessionRow[]> {
  return query<SessionRow>(`SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100`);
}

export async function getSessionById(id: string): Promise<SessionRow | null> {
  const rows = await query<SessionRow>(`SELECT * FROM sessions WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getSessionByInsignId(insignSessionId: string): Promise<SessionRow | null> {
  const rows = await query<SessionRow>(`SELECT * FROM sessions WHERE insign_session_id = $1`, [insignSessionId]);
  return rows[0] ?? null;
}

export async function updateSessionExternLinks(id: string, externLinks: unknown): Promise<void> {
  await query(
    `UPDATE sessions
       SET extern_links_json = $2::jsonb,
           status = 'extern_sent',
           updated_at = NOW()
     WHERE id = $1`,
    [id, JSON.stringify(externLinks)]
  );
}

export async function updateSessionStatus(
  id: string,
  patch: {
    status?: string;
    processStep?: string | null;
    completed?: boolean;
    rejected?: boolean;
    gdprDeclined?: boolean;
    lastStatusJson?: unknown;
    completedAt?: Date | null;
    rejectedAt?: Date | null;
  }
): Promise<void> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [id];
  let i = 2;
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); params.push(patch.status); }
  if (patch.processStep !== undefined) { sets.push(`process_step = $${i++}`); params.push(patch.processStep); }
  if (patch.completed !== undefined) { sets.push(`completed = $${i++}`); params.push(patch.completed); }
  if (patch.rejected !== undefined) { sets.push(`rejected = $${i++}`); params.push(patch.rejected); }
  if (patch.gdprDeclined !== undefined) { sets.push(`gdpr_declined = $${i++}`); params.push(patch.gdprDeclined); }
  if (patch.lastStatusJson !== undefined) { sets.push(`last_status_json = $${i++}::jsonb`); params.push(JSON.stringify(patch.lastStatusJson)); }
  if (patch.completedAt !== undefined) { sets.push(`completed_at = $${i++}`); params.push(patch.completedAt); }
  if (patch.rejectedAt !== undefined) { sets.push(`rejected_at = $${i++}`); params.push(patch.rejectedAt); }
  await query(`UPDATE sessions SET ${sets.join(", ")} WHERE id = $1`, params);
}

export interface WebhookEventRow {
  id: string;
  session_id: string | null;
  insign_session_id: string | null;
  event_id: string | null;
  http_method: string;
  query_params: unknown;
  body: unknown;
  raw_body: string | null;
  remote_addr: string | null;
  received_at: string;
}

export async function recordWebhook(r: {
  sessionId: string | null;
  insignSessionId: string | null;
  eventId: string | null;
  httpMethod: string;
  queryParams: Record<string, string>;
  body: unknown;
  rawBody: string | null;
  remoteAddr: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO webhook_events
       (session_id, insign_session_id, event_id, http_method, query_params, body, raw_body, remote_addr)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
    [
      r.sessionId,
      r.insignSessionId,
      r.eventId,
      r.httpMethod,
      JSON.stringify(r.queryParams),
      r.body === null ? null : JSON.stringify(r.body),
      r.rawBody,
      r.remoteAddr,
    ]
  );
}

export async function listWebhookEvents(): Promise<WebhookEventRow[]> {
  return query<WebhookEventRow>(
    `SELECT * FROM webhook_events ORDER BY received_at DESC LIMIT 200`
  );
}

export interface SignedDocumentRow {
  id: string;
  session_id: string;
  kind: "document" | "audit_pdf" | "audit_json" | "archive_zip";
  filename: string;
  content_type: string;
  data: Buffer;
  bytes: number;
  downloaded_at: string;
}

export async function storeSignedDocument(r: {
  sessionId: string;
  kind: SignedDocumentRow["kind"];
  filename: string;
  contentType: string;
  data: Uint8Array;
}): Promise<void> {
  await query(
    `INSERT INTO signed_documents (session_id, kind, filename, content_type, data)
     VALUES ($1,$2,$3,$4,$5)`,
    [r.sessionId, r.kind, r.filename, r.contentType, Buffer.from(r.data)]
  );
}

export async function listSignedDocuments(sessionId: string): Promise<Omit<SignedDocumentRow, "data">[]> {
  return query<Omit<SignedDocumentRow, "data">>(
    `SELECT id, session_id, kind, filename, content_type, bytes, downloaded_at
       FROM signed_documents WHERE session_id = $1
       ORDER BY downloaded_at DESC`,
    [sessionId]
  );
}

export async function getSignedDocumentById(id: string): Promise<SignedDocumentRow | null> {
  const rows = await query<SignedDocumentRow>(
    `SELECT * FROM signed_documents WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
