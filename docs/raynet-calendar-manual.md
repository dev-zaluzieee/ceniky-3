# Raynet calendar — implementation manual

This document describes how the **Raynet events “calendar”** works in this codebase so you can reproduce the same flow in another project. The UI is a **day view**: pick a date, load that day’s events from Raynet for the **logged-in user’s paired Raynet person**, display them, and optionally link them to internal orders.

---

## 1. End-to-end flow (4 hops)

1. **Browser** — Client calls the Next.js route `GET /api/raynet/events?date=YYYY-MM-DD` (cookie/session → backend JWT).
2. **Next.js API route** — Proxies to the Express backend with `Authorization: Bearer <JWT>` (`frontend/src/app/api/raynet/events/route.ts`).
3. **Express** — `GET /api/raynet/events` validates JWT, reads **`raynet_id`** from the token, calls Raynet via the backend client (`backend/src/routes/raynet.routes.ts` → `raynet.service` → `raynet.queries` → `raynet.client`).
4. **Raynet REST API** — `GET https://app.raynet.cz:443/api/v2/event` with filters (person, date range, categories, status).

---

## 2. Prerequisites

### 2.1 Raynet server credentials (backend only)

The backend talks to Raynet with **HTTP Basic** auth and an **instance header** (see `backend/src/services/raynet.client.ts`):

| Variable | Role |
|----------|------|
| `RAYNET_AUTHORIZATION` or `RAYNET_BASIC_AUTH` | Basic auth value (with or without `Basic ` prefix — code normalizes both) |
| `RAYNET_INSTANCE_NAME` | Sent as `X-Instance-Name` (your Raynet instance) |

Base URL is fixed in code: `https://app.raynet.cz:443`.

### 2.2 User ↔ Raynet person pairing (JWT)

Events are scoped to **one Raynet “person”** using query param `personFilter`. This app stores that id in the JWT as **`raynet_id`** and maps it on each authenticated request:

```91:95:backend/src/middleware/auth.middleware.ts
    req.userId = userEmail;
    req.userEmail = userEmail;
    req.raynetUserId = decoded.raynet_id ?? null;
    req.raynetUserName = decoded.raynet_name ?? null;
```

If `raynet_id` is missing, the events endpoint returns **400** with a clear error (`backend/src/routes/raynet.routes.ts`). Your other project must **issue JWTs that include `raynet_id`** (string) after you define how users are paired to Raynet users.

### 2.3 Backend URL (frontend proxy)

Next.js proxies to Express using `BACKEND_API_URL` or `NEXT_PUBLIC_BACKEND_API_URL` (see `frontend/src/app/api/raynet/events/route.ts`).

---

## 3. Raynet API: listing events

### 3.1 Endpoint

```http
GET /api/v2/event
Host: app.raynet.cz:443
Authorization: Basic …
X-Instance-Name: <RAYNET_INSTANCE_NAME>
Content-Type: application/json
```

### 3.2 Query parameters (as implemented)

| Parameter | Meaning |
|-----------|---------|
| `offset`, `limit` | Pagination (this app uses `limit` 200 by default). |
| `personFilter` | Raynet **person id** — only events for that user (sales rep / owner semantics per Raynet). |
| `scheduledFrom[GE]` | **Greater or equal** — inclusive start of the window. Format used here: `YYYY-MM-DD HH:mm`. |
| `scheduledTill[LT]` | **Strictly less than** — exclusive end (so the window is `[from, till)`). |
| `status[NE]` | **Not equal** — here `CANCELLED` is excluded. |
| `category-id[IN]` | Comma-separated category ids — only those categories are returned. |

Implementation reference:

```118:147:backend/src/services/raynet.client.ts
export async function getEvents(params: {
  personFilter: string;
  scheduledFrom: string;
  scheduledTill: string;
  categoryIds: number[];
  statusNotEquals: string;
  offset?: number;
  limit?: number;
}): Promise<RaynetEventApiResponse> {
  const config = getRaynetConfig();

  try {
    const url = new URL(`${config.baseUrl}/api/v2/event`);

    // Pagination
    url.searchParams.append("offset", String(params.offset ?? 0));
    url.searchParams.append("limit", String(params.limit ?? 200));

    // Raynet person filter binds events to the currently paired Raynet user.
    url.searchParams.append("personFilter", params.personFilter);

    // Date window
    url.searchParams.append("scheduledFrom[GE]", params.scheduledFrom);
    url.searchParams.append("scheduledTill[LT]", params.scheduledTill);

    // Exclude cancelled events and include allowed categories.
    url.searchParams.append("status[NE]", params.statusNotEquals);
    if (params.categoryIds.length > 0) {
      url.searchParams.append("category-id[IN]", params.categoryIds.join(","));
    }
```

Raynet responds with JSON shaped like `{ success, totalCount, data: Event[] }` — see `RaynetEventApiResponse` in `backend/src/types/raynet.types.ts`.

### 3.3 Day window in this app

For a calendar **day** `YYYY-MM-DD`, the query layer builds:

- `scheduledFrom` = `YYYY-MM-DD 00:00`
- `scheduledTill` = `YYYY-MM-DD 23:59` (exclusive upper bound in API terms — events starting before `23:59` that day are included; align with Raynet’s timezone expectations in production)

```46:57:backend/src/queries/raynet.queries.ts
    const from = `${date} 00:00`;
    const till = `${date} 23:59`;

    const response: RaynetEventApiResponse = await raynetClient.getEvents({
      personFilter: ownerId,
      scheduledFrom: from,
      scheduledTill: till,
      categoryIds: [220, 221, 222, 223],
      statusNotEquals: "CANCELLED",
      offset: 0,
      limit: 200,
    });
```

**Category ids** `220–223` are **business-specific** (same family as ADMF export category `220` in `raynet-export.service.ts`). In another project, replace with the category ids your instance uses, or drop the filter if you need all categories.

---

## 4. Backend route contract

- **Method/path:** `GET /api/raynet/events?date=YYYY-MM-DD`
- **Auth:** `Authorization: Bearer <JWT>`
- **Success body:** `{ success: true, data: { events: RaynetEvent[], totalCount: number } }`

Service validation requires `date` to match `YYYY-MM-DD` (`backend/src/services/raynet.service.ts`).

---

## 5. Frontend: proxy + client helper

**Proxy** — forwards query `date` and bearer token to the backend (`frontend/src/app/api/raynet/events/route.ts`).

**Browser helper** — single function used by the calendar page:

```45:61:frontend/src/lib/raynet-events.ts
export async function fetchRaynetEvents(
  date: string
): Promise<RaynetEventsResponse> {
  try {
    if (!date || typeof date !== "string") {
      return {
        success: false,
        error: "Missing or invalid date parameter",
      };
    }

    const response = await fetch(`/api/raynet/events?date=${encodeURIComponent(date)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
```

---

## 6. Calendar UI behavior (this repo)

1. **Auth gate** — Server component checks session; unauthenticated users redirect to login (`frontend/src/app/calendar/page.tsx`).
2. **State** — Selected `Date`, list of `RaynetEvent`, loading/error flags (`CalendarClient.tsx`).
3. **Load on date change** — `useEffect` runs when `selectedDate` changes: `fetchRaynetEvents(toDateString(selectedDate))`.
4. **Sort** — Stable chronological sort on `scheduledFrom`, then `scheduledTill`, then `id`.
5. **Orders link (optional)** — After events load, bulk-resolve internal orders by Raynet event ids via `getOrdersByRaynetEventIds` to show “open existing order” vs “create order”.

---

## 7. Step-by-step checklist for a new project

1. **Obtain Raynet API access** — Basic auth + instance name; confirm `GET /api/v2/event` works from a script with the same headers as above.
2. **Decide person scoping** — Store each app user’s Raynet person id (this app: `personFilter` / JWT `raynet_id`).
3. **Implement server-side client** — Build URL with `[GE]`, `[LT]`, `[NE]`, `[IN]` filters; map env vars for auth.
4. **Protect an HTTP route** — Validate JWT; reject if `raynet_id` missing when events are user-specific.
5. **Map one calendar day** — Convert `YYYY-MM-DD` → `00:00` / `23:59` strings; tune category list for your CRM setup.
6. **Expose API to the frontend** — Either direct backend URL or a BFF/proxy that attaches the session token.
7. **UI** — Day picker → fetch → list + detail; parse `scheduledFrom`/`scheduledTill` (Raynet may use space between date and time — replace with `T` for `Date` parsing in JS).
8. **Pagination** — If a user can have more than `limit` events per day, loop with `offset` until `data.length < limit` or use Raynet’s `totalCount`.

---

## 8. Minimal standalone TypeScript example (server)

Conceptually equivalent to `getEvents` + one day window:

```typescript
async function fetchRaynetDayEvents(options: {
  baseUrl: string; // e.g. https://app.raynet.cz:443
  basicAuthHeader: string; // "Basic base64(user:pass)" or raw token prefixed in code
  instanceName: string;
  personFilter: string;
  date: string; // YYYY-MM-DD
  categoryIds: number[];
}): Promise<unknown> {
  const from = `${options.date} 00:00`;
  const till = `${options.date} 23:59`;
  const url = new URL(`${options.baseUrl}/api/v2/event`);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "200");
  url.searchParams.set("personFilter", options.personFilter);
  url.searchParams.set("scheduledFrom[GE]", from);
  url.searchParams.set("scheduledTill[LT]", till);
  url.searchParams.set("status[NE]", "CANCELLED");
  if (options.categoryIds.length) {
    url.searchParams.set("category-id[IN]", options.categoryIds.join(","));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: options.basicAuthHeader.startsWith("Basic ")
        ? options.basicAuthHeader
        : `Basic ${options.basicAuthHeader}`,
      "X-Instance-Name": options.instanceName,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## 9. Files to read in this repository

| Area | File |
|------|------|
| Raynet HTTP client (events) | `backend/src/services/raynet.client.ts` |
| Day query + categories | `backend/src/queries/raynet.queries.ts` |
| Validation + response shape | `backend/src/services/raynet.service.ts` |
| HTTP route + Swagger | `backend/src/routes/raynet.routes.ts` |
| JWT → `raynetUserId` | `backend/src/middleware/auth.middleware.ts` |
| Event types | `backend/src/types/raynet.types.ts` |
| Next proxy | `frontend/src/app/api/raynet/events/route.ts` |
| Browser fetch helper | `frontend/src/lib/raynet-events.ts` |
| Calendar UI | `frontend/src/app/calendar/CalendarClient.tsx`, `page.tsx` |

---

## 10. Official Raynet documentation

Operator-style filters (`[GE]`, `[LT]`, etc.) and the **Event** resource are defined by **Raynet’s own API reference** for your subscription. When integrating a new instance, confirm field names, timezone handling for `scheduledFrom` / `scheduledTill`, and allowed values for `status` and `category-id` against the latest Raynet docs or support — this manual reflects **this app’s** usage, not a full Raynet API specification.
