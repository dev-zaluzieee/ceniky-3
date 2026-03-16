# Raynet Export Monitoring Tool — Product & Technical Specification

## 1. Purpose

A read-only dashboard for operations/management to monitor all ADMF → Raynet exports. Answers questions like:

- Is the export pipeline healthy?
- Who exported what, when?
- What went wrong with a specific export?
- Are there recurring issues (enum mismatches, auth failures)?
- What's the test vs production ratio?

---

## 2. Product Specification

### 2.1 Dashboard (landing page)

The main view the user sees when opening the monitoring tool. Shows real-time health at a glance.

**Top row — KPI cards (date-filtered, default: today):**

| Card | Value | Color logic |
|---|---|---|
| Total exports | Count of all logs | Neutral |
| Success rate | `SUCCESS / total × 100%` | Green ≥ 95%, yellow ≥ 80%, red < 80% |
| Failed | Count of FAILED | Red if > 0, otherwise green |
| Stuck | Count of PENDING/SENDING older than 5 min | Red if > 0, otherwise green |
| Avg duration | Average `duration_ms` of SUCCESS logs | Yellow if > 5000ms |
| Test vs Prod | `{test_count} / {prod_count}` | Neutral |

**Date range selector**: Quick buttons for "Dnes" (today), "Včera" (yesterday), "Tento týden", "Tento měsíc", custom range picker. Affects all cards and charts.

**Charts (below KPI cards):**

1. **Exports over time** — Bar chart, x-axis = hour (for single day) or day (for multi-day range). Stacked bars: green = SUCCESS, red = FAILED. Hovering shows exact counts.
2. **Error breakdown** — Horizontal bar chart grouping by `error_code`. Only shown when there are failures in the selected range.

### 2.2 Export log table

Below the dashboard, or as a separate tab. The primary detailed view.

**Table columns:**

| Column | Source | Notes |
|---|---|---|
| ID | `id` | Link to detail view |
| Čas | `created_at` | Formatted as `DD.MM.YYYY HH:mm:ss` |
| Uživatel | `user_id` | Email, filterable |
| Zakázka | `order_id` | Link to order in main app |
| Formulář | `form_id` | Link to ADMF form in main app |
| Raynet event | `raynet_event_id` | Link to Raynet (external) |
| Stav | `status` | Color-coded badge: green SUCCESS, red FAILED, yellow PENDING/SENDING |
| Režim | `test_mode` | "TEST" badge (amber) or "PROD" badge (muted) |
| Chybový kód | `error_code` | Only shown when FAILED, filterable |
| Varování | `warnings` | Count badge (e.g. "2 varování"), expandable |
| Doba | `duration_ms` | Formatted as `Xms` or `X.Xs` |

**Filtering (all combinable):**

- **Status**: Multi-select chips (SUCCESS, FAILED, PENDING, SENDING)
- **Mode**: TEST / PRODUCTION / All
- **User**: Dropdown of distinct `user_id` values
- **Error code**: Dropdown (only when FAILED filter active)
- **Date range**: Same as dashboard
- **Fulltext**: Search across `error_message`

**Sorting**: Default by `created_at DESC`. Clickable column headers for ID, time, user, status, duration.

**Pagination**: 50 rows per page, standard prev/next navigation.

### 2.3 Export detail view

Clicking a row ID opens a full detail panel (slide-over or dedicated page).

**Sections:**

1. **Header**: Log ID, status badge, mode badge, timestamp, duration
2. **Context**:
   - User: `user_id`
   - Order: `order_id` (with customer name from JOIN)
   - Form: `form_id` (with ADMF variant name from `form_json->>'name'`)
   - Raynet event: `raynet_event_id`
3. **Request payload**: Pretty-printed JSON viewer of `request_payload`. Collapsible `customFields` section with human-readable labels alongside raw keys.
4. **Warnings**: List of warning objects, each showing `code`, `field`, `reason`. Highlighted in amber.
5. **Response** (only for completed exports):
   - HTTP status: `response_status` with color (green 2xx, red 4xx/5xx)
   - Response body: Pretty-printed JSON viewer of `response_body`
6. **Error** (only for FAILED):
   - Error code: `error_code` with description
   - Error message: `error_message` (full text)

### 2.4 User activity view

A secondary view for answering "what did user X do today?"

**Grouped by user**, showing:
- User email
- Total exports (success / failed / test / prod)
- Last export timestamp
- Expandable: list of their exports (same columns as main table)

**Useful for**: Manager reviewing OVT worker activity, checking who tested vs went live.

### 2.5 Alerts / anomaly indicators

Not a separate view, but visual indicators throughout the dashboard:

- **Stuck exports**: Any log in PENDING or SENDING status for > 5 minutes. Shown as a red banner at the top of the dashboard.
- **Auth failures**: If `error_code = 'RAYNET_AUTH_FAILED'` appears in the last hour, show a yellow warning banner ("Raynet authentication may be broken — check credentials").
- **High failure rate**: If success rate drops below 80% in the last hour, show a red warning.

These are computed from the data on each page load — no separate alerting infrastructure needed.

---

## 3. Technical Specification

### 3.1 Data source

The monitoring tool has **direct readonly access** to the PostgreSQL database. All data comes from these tables:

```
raynet_export_logs  (primary — all monitoring data)
├── form_id  → forms.id
├── order_id → orders.id
└── user_id  (string, matches forms.user_id and orders.user_id)

forms (for ADMF form metadata)
├── id, form_type, form_json, order_id
└── form_json->>'name' (ADMF variant name for display)

orders (for customer context)
├── id, name, email, phone, source_raynet_event_id
└── customer display name for the log detail view
```

### 3.2 Available indexes

```sql
idx_raynet_export_logs_user_created    (user_id, created_at)   -- per-user queries
idx_raynet_export_logs_status_created  (status, created_at)    -- failed/stuck queries
idx_raynet_export_logs_form_id         (form_id)               -- per-form history
idx_raynet_export_logs_created_at      (created_at)            -- time-range scans
```

### 3.3 SQL queries for each view

#### 3.3.1 Dashboard KPI cards

```sql
-- All KPIs in a single query for a date range
SELECT
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE status = 'SUCCESS')            AS success_count,
  COUNT(*) FILTER (WHERE status = 'FAILED')             AS failed_count,
  COUNT(*) FILTER (WHERE status IN ('PENDING','SENDING')
    AND created_at < NOW() - INTERVAL '5 minutes')      AS stuck_count,
  ROUND(AVG(duration_ms) FILTER (WHERE status = 'SUCCESS')) AS avg_duration_ms,
  COUNT(*) FILTER (WHERE test_mode = true)              AS test_count,
  COUNT(*) FILTER (WHERE test_mode = false)             AS prod_count
FROM raynet_export_logs
WHERE created_at >= $1 AND created_at < $2;
```

#### 3.3.2 Exports over time chart

```sql
-- Hourly buckets for a single day
SELECT
  date_trunc('hour', created_at) AS bucket,
  COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
  COUNT(*) FILTER (WHERE status = 'FAILED')  AS failed
FROM raynet_export_logs
WHERE created_at >= $1 AND created_at < $2
GROUP BY bucket
ORDER BY bucket;

-- Daily buckets for multi-day range
SELECT
  date_trunc('day', created_at) AS bucket,
  COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
  COUNT(*) FILTER (WHERE status = 'FAILED')  AS failed
FROM raynet_export_logs
WHERE created_at >= $1 AND created_at < $2
GROUP BY bucket
ORDER BY bucket;
```

#### 3.3.3 Error breakdown chart

```sql
SELECT
  error_code,
  COUNT(*) AS count
FROM raynet_export_logs
WHERE status = 'FAILED'
  AND created_at >= $1 AND created_at < $2
GROUP BY error_code
ORDER BY count DESC;
```

#### 3.3.4 Export log table (paginated, filtered)

```sql
SELECT
  l.id,
  l.created_at,
  l.user_id,
  l.order_id,
  l.form_id,
  l.raynet_event_id,
  l.status,
  l.test_mode,
  l.error_code,
  l.error_message,
  l.duration_ms,
  jsonb_array_length(COALESCE(l.warnings, '[]'::jsonb)) AS warning_count,
  o.name AS order_customer_name,
  f.form_json->>'name' AS form_variant_name
FROM raynet_export_logs l
LEFT JOIN orders o ON o.id = l.order_id
LEFT JOIN forms f ON f.id = l.form_id
WHERE l.created_at >= $1 AND l.created_at < $2
  -- Optional filters (appended dynamically):
  -- AND l.status = ANY($3::text[])
  -- AND l.test_mode = $4
  -- AND l.user_id = $5
  -- AND l.error_code = $6
  -- AND l.error_message ILIKE '%' || $7 || '%'
ORDER BY l.created_at DESC
LIMIT $8 OFFSET $9;
```

Corresponding count query (same WHERE, no JOIN needed for count):
```sql
SELECT COUNT(*)
FROM raynet_export_logs l
WHERE l.created_at >= $1 AND l.created_at < $2;
  -- same optional filters
```

#### 3.3.5 Export detail view

```sql
SELECT
  l.*,
  o.name AS order_customer_name,
  o.email AS order_email,
  o.phone AS order_phone,
  o.source_raynet_event_id,
  f.form_json->>'name' AS form_variant_name,
  f.form_type
FROM raynet_export_logs l
LEFT JOIN orders o ON o.id = l.order_id
LEFT JOIN forms f ON f.id = l.form_id
WHERE l.id = $1;
```

#### 3.3.6 User activity view

```sql
SELECT
  user_id,
  COUNT(*)                                       AS total,
  COUNT(*) FILTER (WHERE status = 'SUCCESS')     AS success_count,
  COUNT(*) FILTER (WHERE status = 'FAILED')      AS failed_count,
  COUNT(*) FILTER (WHERE test_mode = true)       AS test_count,
  COUNT(*) FILTER (WHERE test_mode = false)      AS prod_count,
  MAX(created_at)                                AS last_export_at
FROM raynet_export_logs
WHERE created_at >= $1 AND created_at < $2
GROUP BY user_id
ORDER BY total DESC;
```

#### 3.3.7 Stuck exports alert

```sql
SELECT id, form_id, user_id, status, created_at
FROM raynet_export_logs
WHERE status IN ('PENDING', 'SENDING')
  AND created_at < NOW() - INTERVAL '5 minutes'
ORDER BY created_at;
```

#### 3.3.8 Recent auth failures alert

```sql
SELECT COUNT(*) AS auth_failures_last_hour
FROM raynet_export_logs
WHERE error_code = 'RAYNET_AUTH_FAILED'
  AND created_at >= NOW() - INTERVAL '1 hour';
```

#### 3.3.9 Warnings analysis (for recurring data quality issues)

```sql
-- Most common warning types
SELECT
  w->>'code' AS warning_code,
  w->>'field' AS warning_field,
  COUNT(*) AS occurrences
FROM raynet_export_logs,
  jsonb_array_elements(COALESCE(warnings, '[]'::jsonb)) AS w
WHERE created_at >= $1 AND created_at < $2
GROUP BY warning_code, warning_field
ORDER BY occurrences DESC;
```

### 3.4 Column reference: `error_code` values

| error_code | Meaning | Typical cause |
|---|---|---|
| `MISSING_EVENT_ID` | Order has no `source_raynet_event_id` | Order not created from calendar |
| `FORM_NOT_FOUND` | ADMF form doesn't exist or was deleted | Race condition or stale UI |
| `ORDER_NOT_FOUND` | Linked order missing | Data integrity issue |
| `MAPPING_ERROR` | Failed to build Raynet payload | Unexpected form_json shape |
| `RAYNET_AUTH_FAILED` | HTTP 401/403 from Raynet | Bad credentials or expired token |
| `RAYNET_VALIDATION_ERROR` | HTTP 4xx from Raynet (not auth) | Invalid field value rejected by Raynet |
| `RAYNET_TIMEOUT` | No response within 30s | Raynet API down or slow |
| `RAYNET_SERVER_ERROR` | HTTP 5xx from Raynet | Raynet internal error |
| `RAYNET_CONFIG_MISSING` | Env vars not set | Deployment issue |
| `UNKNOWN_ERROR` | Uncategorized exception | Bug in export code |

### 3.5 Column reference: `warnings[].code` values

| code | Meaning | Example |
|---|---|---|
| `FIELD_SKIPPED` | Field had a value but was not sent | `typZarizeni = "Firma"` not in Raynet enum |
| `FIELD_TRUNCATED` | Value was cut to fit Raynet limits | Long text in STRING field |
| `FIELD_EMPTY` | Expected field was missing | `raynet_name` not in auth |
| `ENUM_MISMATCH` | Value doesn't match Raynet enum | `zalohaZaplacena = "Kartou"` |

### 3.6 Performance considerations

- **Volume estimate**: ~50–200 exports/day (team of ~10–30 OVT workers, each doing ~5–10 exports).
- **Table growth**: ~6,000 rows/month. Even after a year (~72K rows), all queries are fast with existing indexes.
- **No archival needed** for at least 2–3 years at this volume.
- **Dashboard query cost**: The KPI + chart queries touch only the `raynet_export_logs` table with index scans on `created_at`. The log table query JOINs `orders` and `forms` but is paginated (LIMIT 50). All queries should complete in < 50ms.
- **JSONB columns** (`request_payload`, `response_body`, `warnings`) are not indexed — they're only read in detail view (single-row fetch by PK) or aggregated with `jsonb_array_elements` (only for warnings analysis, which is a rare admin query).

### 3.7 Linking to external systems

The detail view should provide clickable links:

| Target | URL pattern | Source |
|---|---|---|
| ADMF form | `/orders/{order_id}/forms/{form_id}` | `order_id`, `form_id` from log |
| Order | `/orders/{order_id}` | `order_id` from log |
| Raynet event | `https://app.raynet.cz/#/event/{raynet_event_id}` | `raynet_event_id` from log |

### 3.8 Request payload human-readable labels

When displaying `request_payload.customFields` in the detail view, map the Raynet field keys to Czech labels for readability:

```
Email_1181e        → E-mail
Dalsi_kont_dcaae   → Telefon
DPH_a6f2e          → DPH
RDbyt_45fb8        → Typ zařízení
Zpusob_uhr_1bc0a   → Způsob úhrady zálohy
Zaloha_f384a       → Záloha
Doplatek_98b22     → Doplatek
Celkova_ho_0b99a   → Celková hodnota
Variabilni_675b2   → Variabilní symbol
Zamerovac_2b7ef    → Zaměřovač
Zvonek_60b5d       → Zvonek
Patro_4784d        → Patro
Info_k_par_4946a   → Info k parkování
Dalsi_dopl_1e01a   → Poznámky
Adresa_kdy_8f1ac   → Adresa (když nesedí)
Duvod_neuh_fec41   → Info k záloze
Info_k_fak_4dcbc   → Info k faktuře
MNG_SLEVA_aac47    → MNG sleva (ano/ne)
MNG_sleva__0836b   → MNG sleva (Kč)
OVT_sleva__909bc   → OVT sleva (Kč)
```

This label map should be a static lookup in the monitoring tool frontend — not stored in the database.
