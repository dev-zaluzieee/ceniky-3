function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  insign: {
    baseUrl: () => required("INSIGN_BASE_URL").replace(/\/+$/, ""),
    username: () => required("INSIGN_USERNAME"),
    password: () => required("INSIGN_PASSWORD"),
    foruser: () => required("INSIGN_FORUSER"),
    /** Optional override: when set, the client uses Bearer token instead of HTTP Basic. */
    bearerToken: () => optional("INSIGN_BEARER_TOKEN"),
  },
  webhook: {
    baseUrl: () => required("INSIGN_WEBHOOK_BASE_URL").replace(/\/+$/, ""),
    username: () => optional("INSIGN_WEBHOOK_USERNAME"),
    password: () => optional("INSIGN_WEBHOOK_PASSWORD"),
  },
  browser: {
    callbackBaseUrl: () => required("INSIGN_BROWSER_CALLBACK_BASE_URL").replace(/\/+$/, ""),
  },
  database: {
    url: () => required("DATABASE_URL"),
  },
  defaults: {
    recipientEmail: () => optional("DEFAULT_RECIPIENT_EMAIL", "krestan.karel@gmail.com"),
  },
};
