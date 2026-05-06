-- inSign POC schema. Apply manually:
--   psql "$DATABASE_URL" -f schema/001_init.sql

CREATE TABLE IF NOT EXISTS sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insign_session_id     TEXT UNIQUE NOT NULL,
  displayname           TEXT NOT NULL,
  foruser               TEXT NOT NULL,

  customer_name         TEXT,
  customer_email        TEXT,
  customer_phone        TEXT,
  mediator_name         TEXT,
  mediator_email        TEXT,

  delivery_mode         TEXT NOT NULL CHECK (delivery_mode IN ('inapp', 'extern')),

  access_url            TEXT,                  -- one-time URL returned by /configure/session for in-app signing
  extern_links_json     JSONB,                 -- result of /extern/beginmulti (per-recipient links)

  status                TEXT NOT NULL DEFAULT 'created',
  last_status_json      JSONB,
  process_step          TEXT,
  completed             BOOLEAN NOT NULL DEFAULT FALSE,
  rejected              BOOLEAN NOT NULL DEFAULT FALSE,
  gdpr_declined         BOOLEAN NOT NULL DEFAULT FALSE,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  rejected_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status);

CREATE TABLE IF NOT EXISTS webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID REFERENCES sessions (id) ON DELETE SET NULL,
  insign_session_id TEXT,
  event_id          TEXT,                      -- VORGANGABGESCHLOSSEN, SIGNATURERSTELLT, ...
  http_method       TEXT NOT NULL,             -- GET / POST / PUT
  query_params      JSONB,
  body              JSONB,
  raw_body          TEXT,
  remote_addr       TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_events_session_id_idx ON webhook_events (session_id, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_event_id_idx ON webhook_events (event_id);

CREATE TABLE IF NOT EXISTS signed_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('document', 'audit_pdf', 'audit_json', 'archive_zip')),
  filename          TEXT NOT NULL,
  content_type      TEXT NOT NULL,
  data              BYTEA NOT NULL,
  bytes             INTEGER GENERATED ALWAYS AS (octet_length(data)) STORED,
  downloaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signed_documents_session_id_idx ON signed_documents (session_id);
