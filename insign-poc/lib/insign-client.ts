/**
 * Thin typed wrapper around the inSign API (instance: dreamview.test.getinsign.show).
 * Auth: HTTP Basic. Subset covering the POC's "all paths" scope:
 *   create session, send extern signing links, status, reject, download signed PDF/audit.
 *
 * This wrapper is the unit we will port into ceniky-3 once the POC validates the flow.
 */

import { env } from "./env";
import { clearTokenCache, getAccessToken } from "./insign-auth";
import type {
  ConfigureSessionInput,
  ConfigureDocumentsResult,
  StartExternMultiuserInput,
  ExternMultiuserResult,
  CheckStatusResult,
  SessionStatusResult,
} from "./insign-types";

async function call(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {}
): Promise<Response> {
  const url = new URL(env.insign.baseUrl() + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const send = async (): Promise<Response> => {
    const token = await getAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return fetch(url, { ...init, headers, cache: "no-store" });
  };

  // Single retry on 401 in case the cached token expired between calls.
  let res = await send();
  if (res.status === 401) {
    clearTokenCache();
    res = await send();
  }
  return res;
}

async function callJson<T>(
  path: string,
  init: Parameters<typeof call>[1] = {}
): Promise<T> {
  const res = await call(path, init);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`inSign ${path} returned non-JSON (status ${res.status}): ${text.slice(0, 500)}`);
  }
  if (!res.ok) {
    const msg = (parsed as { message?: string })?.message ?? text.slice(0, 500);
    throw new Error(`inSign ${path} failed (${res.status}): ${msg}`);
  }
  return parsed as T;
}

export async function configureSession(body: ConfigureSessionInput): Promise<ConfigureDocumentsResult> {
  return callJson<ConfigureDocumentsResult>("/configure/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function startExternMultiuser(body: StartExternMultiuserInput, opts: { skipLandingPage?: boolean } = {}): Promise<ExternMultiuserResult> {
  return callJson<ExternMultiuserResult>("/extern/beginmulti", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    query: { skipLandingPage: opts.skipLandingPage ?? false },
  });
}

export async function checkStatus(sessionid: string): Promise<CheckStatusResult> {
  return callJson<CheckStatusResult>("/get/checkstatus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid }),
  });
}

export async function getStatus(sessionid: string, withImages = false): Promise<SessionStatusResult> {
  return callJson<SessionStatusResult>("/get/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid }),
    query: { withImages },
  });
}

/**
 * /configure/ablehnen — abort + delete a session. GDPR-flagged delete on opt-out.
 *
 * Despite the OpenAPI declaring `sessionid` as a required query param, on POST
 * the server only reads it from the JSON body — passing it in the query alone
 * produces a NullPointerException. `gdprDeclined` does still go in the query.
 */
export async function rejectSession(sessionid: string, opts: { gdprDeclined?: boolean } = {}): Promise<void> {
  const res = await call("/configure/ablehnen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid }),
    query: { gdprDeclined: opts.gdprDeclined ?? false },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`inSign /configure/ablehnen failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

/**
 * Download the session bundle as a single ZIP (or a single PDF if there is one document).
 * Returns the raw bytes plus the filename advertised by the server.
 */
export async function downloadDocuments(
  sessionid: string,
  opts: { auditreport?: boolean | "dynamic"; incBioData?: boolean } = {}
): Promise<{ filename: string; contentType: string; bytes: Uint8Array }> {
  const res = await call("/get/documents/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid }),
    query: {
      auditreport: opts.auditreport === undefined ? "true" : String(opts.auditreport),
      incBioData: opts.incBioData ?? true,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`inSign /get/documents/download failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const filename = parseContentDispositionFilename(res.headers.get("content-disposition")) ?? `session-${sessionid}.bin`;
  return {
    filename,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    bytes: buf,
  };
}

function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;
  // Prefer RFC 5987 filename*=UTF-8''percent-encoded
  const star = header.match(/filename\*\s*=\s*([^']+)'[^']*'([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[2]!.trim()); } catch { /* fall through */ }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plain?.[1] ?? null;
}

/** Audit report as JSON (separate from the audit PDF inside the ZIP). */
export async function getAuditJson(sessionid: string): Promise<unknown> {
  return callJson<unknown>("/get/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionid }),
  });
}
