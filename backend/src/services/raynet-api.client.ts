import { InternalServerError, BadRequestError } from "../utils/errors";

export interface RaynetConfig {
  baseUrl: string;
  authorizationHeader: string;
  instanceName: string;
}

export interface RaynetHttpLogEntry {
  step: string;
  method: string;
  url: string;
  request: {
    headers: Record<string, string>;
    bodyMeta?: Record<string, unknown> | null;
  };
  response?: {
    status: number;
    body: Record<string, unknown> | string | null;
  };
  error?: {
    message: string;
    name?: string;
  };
  durationMs: number;
  at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (key === "authorization") out[k] = "<redacted>";
    else if (key === "x-instance-name") out[k] = "<redacted>";
    else out[k] = v;
  }
  return out;
}

export function getRaynetConfig(): RaynetConfig {
  // Support both legacy RAYNET_AUTHORIZATION and new RAYNET_BASIC_AUTH envs
  const rawAuthorization = process.env.RAYNET_AUTHORIZATION || process.env.RAYNET_BASIC_AUTH;
  const instanceName = process.env.RAYNET_INSTANCE_NAME;

  if (!rawAuthorization) {
    throw new BadRequestError("RAYNET_AUTHORIZATION or RAYNET_BASIC_AUTH environment variable is not set");
  }
  if (!instanceName) {
    throw new BadRequestError("RAYNET_INSTANCE_NAME environment variable is not set");
  }

  const authorizationHeader = rawAuthorization.startsWith("Basic ")
    ? rawAuthorization
    : `Basic ${rawAuthorization}`;

  return {
    baseUrl: "https://app.raynet.cz",
    authorizationHeader,
    instanceName,
  };
}

async function parseResponseBody(response: Response): Promise<Record<string, unknown> | string | null> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function raynetJsonRequest(params: {
  step: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
}): Promise<{ status: number; body: Record<string, unknown> | string | null; log: RaynetHttpLogEntry }> {
  const cfg = getRaynetConfig();
  const startedAt = Date.now();

  const url = new URL(`${cfg.baseUrl}${params.path}`);
  for (const [k, v] of Object.entries(params.query ?? {})) {
    if (v === undefined) continue;
    url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    Authorization: cfg.authorizationHeader,
    "X-Instance-Name": cfg.instanceName,
    "Content-Type": "application/json",
  };

  const logBase: Omit<RaynetHttpLogEntry, "durationMs"> = {
    step: params.step,
    method: params.method,
    url: url.toString(),
    request: {
      headers: redactHeaders(headers),
      bodyMeta: params.body !== undefined ? { kind: "json" } : null,
    },
    at: nowIso(),
  };

  try {
    const response = await fetch(url.toString(), {
      method: params.method,
      headers,
      body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
      signal: AbortSignal.timeout(params.timeoutMs ?? 30_000),
    });

    const respBody = await parseResponseBody(response);
    const log: RaynetHttpLogEntry = {
      ...logBase,
      response: { status: response.status, body: respBody },
      durationMs: Date.now() - startedAt,
    };
    return { status: response.status, body: respBody, log };
  } catch (error: any) {
    const message = error?.message ?? "Unknown error";
    const log: RaynetHttpLogEntry = {
      ...logBase,
      error: { message, name: error?.name },
      durationMs: Date.now() - startedAt,
    };
    throw Object.assign(new InternalServerError(`Raynet API call failed: ${message}`), { raynetLog: log });
  }
}

export async function raynetFileUpload(params: {
  step: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  timeoutMs?: number;
}): Promise<{
  status: number;
  body: Record<string, unknown> | string | null;
  log: RaynetHttpLogEntry;
}> {
  const cfg = getRaynetConfig();
  const startedAt = Date.now();
  const url = new URL(`${cfg.baseUrl}/api/v2/fileUpload`);

  const headers: Record<string, string> = {
    Authorization: cfg.authorizationHeader,
    "X-Instance-Name": cfg.instanceName,
    // NOTE: do NOT set Content-Type here — fetch will add multipart boundary.
  };

  const formData = new FormData();
  // Create a fresh Uint8Array backed by an ArrayBuffer (avoids SharedArrayBuffer typing issues).
  const bytes = new Uint8Array(params.buffer.length);
  bytes.set(params.buffer);
  const blob = new Blob([bytes], { type: params.contentType });
  formData.append("file", blob, params.filename);

  const logBase: Omit<RaynetHttpLogEntry, "durationMs"> = {
    step: params.step,
    method: "POST",
    url: url.toString(),
    request: {
      headers: redactHeaders(headers),
      bodyMeta: {
        kind: "multipart",
        field: "file",
        filename: params.filename,
        contentType: params.contentType,
        sizeBytes: params.buffer.length,
      },
    },
    at: nowIso(),
  };

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(params.timeoutMs ?? 30_000),
    });
    const respBody = await parseResponseBody(response);
    const log: RaynetHttpLogEntry = {
      ...logBase,
      response: { status: response.status, body: respBody },
      durationMs: Date.now() - startedAt,
    };
    return { status: response.status, body: respBody, log };
  } catch (error: any) {
    const message = error?.message ?? "Unknown error";
    const log: RaynetHttpLogEntry = {
      ...logBase,
      error: { message, name: error?.name },
      durationMs: Date.now() - startedAt,
    };
    throw Object.assign(new InternalServerError(`Raynet fileUpload failed: ${message}`), { raynetLog: log });
  }
}

