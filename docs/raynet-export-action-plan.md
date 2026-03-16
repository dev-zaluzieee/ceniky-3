# Raynet Export — Action Plan

What needs to happen before we can implement the ADMF → Raynet event export.

---

## Phase 1: Raynet API Research — RESOLVED

All custom field definitions retrieved from Raynet API. Key findings below.

### 1.1 `RDbyt_45fb8` (typ zařízení) — RESOLVED
- **Raynet dataType**: ENUMERATION
- **Exact allowed values**: `"RD"`, `"Byt"`, `"Nebytový protor"`, `"chata"`, `"vila"`, `"Obytná maringotka"`
- **Note**: "Nebytový protor" is a typo in Raynet (missing 's' in prostor). We must match it exactly.
- **Current ADMF has**: "Byt", "RD", "Firma" → "Firma" is not in Raynet enum. Must be replaced.
- **Action**: Replace ADMF `typZarizeni` options with exact Raynet values.

### 1.2 `Zpusob_uhr_1bc0a` (způsob úhrady zálohy) — RESOLVED
- **Raynet dataType**: ENUMERATION
- **Exact allowed values**: `"Hotově"`, `"Terminálem"`, `"QR"`, `"Fakturou"`, `"převodem"`
- **Note**: "převodem" is lowercase in Raynet. We must match it exactly.
- **Current ADMF has**: "Hotově", "Kartou", "Převodem" → "Kartou" doesn't exist in Raynet, "Převodem" must become lowercase "převodem".
- **Action**: Replace ADMF `zalohaZaplacena` options with exact Raynet values.

### 1.3 `Finalni_do_9c5a4` — RESOLVED: DO NOT EXPORT
- This is an MVT field ("Doplatek (vybírá MVT)") in the "Montáž - MVT" group.
- Filled by the montér, not the OVT worker. Not part of our export scope.

### 1.4 `DPH_a6f2e` — RESOLVED
- **Raynet dataType**: ENUMERATION (string values)
- **Exact allowed values**: `"0"`, `"12"`, `"21"`
- **Label**: "Ceníky_DPH", group: "Platba na místě - nezapisovat"
- **Action**: Send vatRate as **string** (e.g. `"12"`), not number.

### 1.5 Raynet Event update API — RESOLVED
- `POST https://app.raynet.cz/api/v2/event/{eventId}/` with Basic Auth + `X-Instance-Name` header
- Payload: `{ category, status, customFields: { ... } }`
- Response: `{ success: true }`

### 1.6 `pocetSkel` / `pocetBalkonovychDveri` — RESOLVED: EXCLUDED
- These fields are excluded from the export scope. No action needed.

---

## Phase 2: New Fields in ADMF — DONE

All 9 fields added to TypeScript types, form UI, frontend PDF, and backend PDF.

### Required for export (`pridat do admf`)

| Field | ADMF type | Raynet field | Raynet dataType | UI placement | Notes |
|---|---|---|---|---|---|
| `variabilniSymbol` | number | `Variabilni_675b2` | BIG_DECIMAL | Platba a montáž | **Prefill with customer phone number** (strips +420 prefix). Raynet expects a number. |
| `infoKZaloze` | string | `Duvod_neuh_fec41` | TEXT | Platba a montáž | Free text. Raynet label: "Info k záloze (OVT)". Always visible (not conditional). |
| `infoKFakture` | string | `Info_k_fak_4dcbc` | TEXT | Platba a montáž | Free text. Raynet label: "Info k faktuře (OVT)". |
| `mngSleva` | boolean | `MNG_SLEVA_aac47` | BOOLEAN | "Slevy" section after product table | Toggle: was MNG (manager) discount applied? Companion to mngSlevaCastka. |
| `mngSlevaCastka` | number | `MNG_sleva__0836b` | MONETARY (CZK) | "Slevy" section after product table | Manager discount amount from **total price** (not per-row). Shown when mngSleva = true. |
| `ovtSlevaCastka` | number | `OVT_sleva__909bc` | MONETARY (CZK) | "Slevy" section after product table | OVT discount amount from **total price** (not per-row). |

### Informative fields (`pridat informativne`)

| Field | ADMF type | Raynet field | Raynet dataType | UI placement | Notes |
|---|---|---|---|---|---|
| `zvonek` | string | `Zvonek_60b5d` | STRING | Další informace | Name on doorbell / buzzer instructions |
| `patro` | string | `Patro_4784d` | STRING | Další informace | Floor number |
| `infoKParkovani` | string | `Info_k_par_4946a` | TEXT | Další informace (near `parkovani` toggle) | Additional parking info text (beyond the existing boolean) |

### Files updated:
1. ✅ `frontend/src/types/forms/admf.types.ts` — all 9 fields added to `AdmfFormData`
2. ✅ `frontend/src/app/forms/admf/AdmfFormClient.tsx` — UI for all fields + variabilníSymbol prefill logic
3. ✅ `frontend/src/lib/admf-pdf.ts` — all fields rendered in PDF
4. ✅ `backend/src/services/admf-pdf.service.ts` — `AdmfPdfData` interface extended, all fields rendered

---

## Phase 3: Enum Alignment — DONE

Updated ADMF dropdown fields to match Raynet enum values exactly.

### 3.1 `typZarizeni` ✅
- **Where**: `AdmfFormClient.tsx` dropdown options
- **Old values**: `"Byt"`, `"RD"`, `"Firma"`
- **New values** (exact Raynet enum): `"RD"`, `"Byt"`, `"Nebytový protor"`, `"chata"`, `"vila"`, `"Obytná maringotka"`
- **Implementation**: `value="Nebytový protor"` (Raynet typo), display text shows "Nebytový prostor"
- **Note**: `"Firma"` removed. Existing saved forms with `"Firma"` will show empty select — acceptable.

### 3.2 `zalohaZaplacena` ✅
- **Where**: `AdmfFormClient.tsx` dropdown options
- **Old values**: `"Hotově"`, `"Kartou"`, `"Převodem"`
- **New values** (exact Raynet enum): `"Hotově"`, `"Terminálem"`, `"QR"`, `"Fakturou"`, `"převodem"`
- **Implementation**: `value="převodem"` (lowercase match), display text shows "Převodem"
- **Note**: `"Kartou"` → `"Terminálem"`, `"Převodem"` → `"převodem"`. Old values in saved forms won't match.

---

## Phase 4: Auto-fill & Computed Logic — DONE (implemented in export service)

### 4.1 Auto-fill `zaměřovač` ✅
- **Raynet field**: `Zamerovac_2b7ef` (ENUMERATION — list of 32 worker names)
- **Source**: `raynet_name` from auth response
- **Implementation**: Passed from route handler to `buildRaynetPayload()`. Generates warning if missing.
- **TODO**: Wire `raynet_name` from JWT payload once available in auth middleware.

### 4.2 Compute `totalSDph` for export ✅
- **Formula**: `(Σ(cenaPoSleve × ks) + montazCenaBezDph) × (1 + vatRate / 100)`, rounded to integer
- **Implementation**: `computeTotalBezDph()` in `raynet-export.service.ts`

### 4.3 Compose `adresaKdyzNesedi` ✅
- When `jinaAdresaDodani === true`: compose parts with `, ` separator
- **Implementation**: In `buildRaynetPayload()`, sends only when filled.

### 4.4 Set `status` on export ✅
- Payload always sets `status: "COMPLETED"`.

### 4.5 Convert `vatRate` to string ✅
- `String(vatRate)` with enum validation (warns if not 0/12/21).

---

## Phase 5: Merge Logic — DONE (implemented in export service)

### 5.1 Poznámky → `Dalsi_dopl_1e01a` ✅
- Format: `"Výroba: {x}\nMontáž: {y}"`, skipping empty sections.
- **Implementation**: In `buildRaynetPayload()`.

---

## Phase 6: Auth Enhancement — DONE

- ✅ `raynet_name` added to auth response
- **Requirement**: The stored name must exactly match one of the `Zamerovac_2b7ef` enum values in Raynet

---

## Phase 7: Export Implementation — DONE

### 7.1 UX: Manual export with TEST/PRODUCTION mode ✅
- **Trigger**: "Odeslat zákazníkovi" button on ADMF edit page
- **Modal**: Confirmation modal with mode-aware messaging:
  - **PRODUCTION**: "Tato akce synchronizuje data do Raynetu a odešle e-mail zákazníkovi."
  - **TEST**: "Testovací režim — data se neodešlou do Raynetu, zákazníkovi nepřijde e-mail."
- **Mode toggle**: Header switch (TEST/PRODUCTION), persisted in localStorage, defaults to TEST
- **Status indicator**: Shows "Exportováno do Raynet (test): {date}" below button
- **Re-export**: Allowed (overwrites Raynet data). Timestamp updates each time.

### 7.2 Database: `raynet_export_logs` table ✅
- Full monitoring table (not just a column on `forms`):
  - `id`, `form_id`, `order_id`, `raynet_event_id`, `user_id`
  - `status` (PENDING/MAPPING/SENDING/SUCCESS/FAILED)
  - `test_mode` (boolean — distinguishes test from production)
  - `request_payload` (JSONB — exact payload sent)
  - `response_status`, `response_body` (Raynet HTTP response)
  - `error_message`, `error_code` (categorized errors)
  - `warnings` (JSONB array — non-fatal issues)
  - `duration_ms`, `created_at`, `completed_at`
- **Migration**: `backend/schema/004_raynet_export_logs.sql`
- **Indexes**: user+date, status+date, form_id, created_at

### 7.3 Backend ✅
- **Mapping service**: `backend/src/services/raynet-export.service.ts`
  - `buildRaynetPayload()` — maps all CSV fields, collects warnings for enum mismatches
  - `exportFormToRaynet()` — 3-write pipeline (PENDING → SENDING → SUCCESS/FAILED)
  - In test mode: full pipeline runs but HTTP call to Raynet is skipped
- **Queries**: `backend/src/queries/raynet-export-logs.queries.ts`
- **Types**: `backend/src/types/raynet-export.types.ts`
- **Routes** (in `forms.routes.ts`):
  - `POST /api/forms/:id/export-raynet` — triggers export
  - `GET /api/forms/:id/export-status` — returns latest successful export info

### 7.4 Frontend ✅
- **Mode context**: `frontend/src/lib/mode-context.tsx` (TEST/PRODUCTION, localStorage)
- **Header toggle**: Amber=TEST, Red=PRODUCTION
- **AdmfFormClient**: Export button with loading state, error display, confirmation modal
- **Preconditions**: Button disabled when form is dirty or not yet saved

### 7.5 Email sending — TODO
- Marked with `// TODO: trigger email sending to customer here` in AdmfFormClient
- Will be implemented when email logic is defined

---

## Remaining TODOs

1. Wire `raynet_name` from JWT/auth into the export route handler (currently passes `undefined`, generates warning)
2. Implement email sending to customer on production export
3. Build monitoring UI above `raynet_export_logs` table
