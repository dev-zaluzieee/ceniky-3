# ADMF (`form_json`) — specification for integrators

This document describes the **administrativní formulář (ADMF)** as persisted in the database: structure of `form_json`, how the OVT frontend presents values, and how **financial / back-office systems** should interpret amounts, VAT, and discounts.

**Canonical TypeScript types:** `frontend/src/types/forms/admf.types.ts` (mirrored conceptually in backend extract types: `backend/src/types/extract-products.types.ts` for product rows and `pricingTrace`).

**Storage:** table `forms`, column `form_json` (JSON/JSONB), with `form_type = 'admf'`. The same object is what the PDF generator and export mappers read.

---

## 1. Role of ADMF in the app

- **Step 1:** Users fill **custom** JSON-schema product forms (`form_type = 'custom'`).
- **ADMF:** Built from one or more custom forms; backend **extract-products** resolves prices and writes `productRows` (+ optional `pricingTrace`).
- **Persisted snapshot:** Whatever the user saves in ADMF is the **source of truth** for customer-facing PDF, Raynet custom fields, and ERP column values (see §8).

External systems should treat `form_json` as a **versioned document**: new keys may appear; old records may omit newer fields.

---

## 2. Top-level structure

| JSON key | Type | Required | Meaning |
|----------|------|----------|---------|
| `name` | `string` | yes | Internal label (e.g. „Varianta 1“). |
| `source_form_ids` | `number[]` | yes | IDs of custom forms used to build this ADMF (provenance). |
| `productRows` | `object[]` | yes | Product lines (see §4). May be `[]` for a fresh form. |

All other keys are optional unless noted per section.

---

## 3. Customer, invoice, and delivery

These fields mirror the **order** unless the user enables invoice override.

| JSON key | UI section (Czech) | Type | Notes |
|----------|---------------------|------|--------|
| `jmenoPrijmeni` | Údaje zákazníka | `string` | Full name (natural person path). |
| `ico`, `dic` | Firmě / faktura | `string` | Company identifiers when `typOsoby === "pravnicka"`. |
| `nazevFirmy` | Firma | `string` | Legal name for company. |
| `email`, `telefon` | Kontakt | `string` | |
| `ulice`, `mesto`, `psc` | Adresa | `string` | Billing / contact address. |
| `castMesta`, `bytRdFirma` | — | `string` | Extra address hints; may be empty or absent. |
| `fakturaOverride` | „Upravit fakturační údaje“ | `boolean` | If `true`, user edits invoice block separately from order copy. |
| `typOsoby` | — | `"soukroma" \| "pravnicka"` | Drives PDF labels („Údaje zákazníka“ vs „Údaje firmy“). Default mental model: `soukroma`. |
| `jinaAdresaDodani` | Jiná adresa dodání | `boolean` | If `true`, use delivery fields below. |
| `dodaciUlice`, `dodaciMesto`, `dodaciPsc` | Adresa dodání | `string` | Only meaningful when `jinaAdresaDodani` is true. |

**Interpretation for office systems:** Use `typOsoby` to decide whether `ico`/`dic`/`nazevFirmy` vs `jmenoPrijmeni` is primary. Prefer **saved ADMF values** over raw order data when reconciling (user may have overridden).

---

## 4. Product rows (`productRows[]`)

Each element:

| JSON key | Type | Meaning |
|----------|------|---------|
| `id` | `string` | Stable row id in the UI (client-generated). |
| `produkt` | `string` | Human-readable product description (e.g. dimension + product name). |
| `ks` | `number` | Quantity (pieces). Default `1` when missing in calculations. |
| `cena` | `number` | **Unit price without VAT** before line discount (after internal surcharges rolled into line). |
| `sleva` | `number` | Line discount **percent** `0–100`. |
| `cenaPoSleve` | `number` | **Unit price without VAT** after discount: \(\text{round}(\text{cena} \times (1 - \text{sleva}/100))\) (integer rounding as in UI). |
| `baseCena` | `number` | Optional: grid unit before surcharges (audit / display). |
| `surcharges` | `{ code, label?, amount }[]` | Optional příplatky breakdown (`amount` without VAT). |
| `surchargeWarnings` | `string[]` | Czech messages; for operators, not customer PDF. |
| `priceAffectingFields` | `{ code, label, value }[]` | Up to two (typically) schema-driven selectors shown as extra columns (PDF: „Parametr 1/2“). |
| `pricingTrace` | object | Audit trail; see §7. **Not** shown in OVT UI. |

**Line total without VAT:**

\[
\text{lineBezDph} = \text{cenaPoSleve} \times \text{ks}
\]

**Customer PDF note:** surcharges are **not** itemized on the PDF; the customer sees aggregate `cena` / `cenaPoSleve` per row only (`backend/src/services/admf-pdf.service.ts`).

---

## 5. Montáž (installation) and order-level discounts

| JSON key | Type | Meaning |
|----------|------|---------|
| `montazCenaZpusob` | `"auto" \| "manual"` | `auto` → fixed default **1339 Kč bez DPH**; `manual` → use `montazCenaBezDph`. Records **without** this field behave like `manual` in backend helpers. |
| `montazCenaBezDph` | `number` | Installation **without VAT** when mode is manual (or stored default). |
| `mngSleva` | `boolean` | Manager discount **enabled**. |
| `mngSlevaCastka` | `number` | Amount **without VAT** subtracted from total when `mngSleva` is true and value > 0. |
| `ovtSlevaCastka` | `number` | OVT discount **without VAT** (always subtracted when > 0). |

**Effective montáž bez DPH** (single source of truth in backend):

```typescript
// backend/src/utils/admf-order-totals.ts — conceptual
// auto → 1339; else numeric montazCenaBezDph or fallback 1339
```

---

## 6. VAT, totals, and payment fields

### 6.1 VAT rate

| JSON key | Type | Allowed values |
|----------|------|----------------|
| `vatRate` | `number` | **0, 12, 21** (percent). If missing or non-numeric, backend **defaults to 12** for totals (note: **0 is valid** — do not treat falsy as default). |

Related toggles:

| JSON key | Meaning |
|----------|---------|
| `platceDph` | Customer is VAT payer (boolean; informational / PDF). |
| `typProstoru` | `"bytovy"` (default) or `"nebytovy"` — space type. |
| `faktura` | Present in defaults (`true`); legacy/secondary flag in types — do not rely on it for VAT math. |

### 6.2 Canonical totals (bez DPH → s DPH)

Implementations **must** match:

```34:48:backend/src/utils/admf-order-totals.ts
export function computeAdmfCelkemBezDph(formJson: Record<string, unknown>): number {
  const produkty = sumProductRowsBezDph(formJson);
  const montaz = effectiveMontazBezDph(formJson);
  const ovt = Math.max(0, Number(formJson.ovtSlevaCastka) || 0);
  const mng =
    formJson.mngSleva === true && (Number(formJson.mngSlevaCastka) || 0) > 0
      ? Math.max(0, Number(formJson.mngSlevaCastka) || 0)
      : 0;
  return Math.max(0, produkty + montaz - ovt - mng);
}

export function computeAdmfCelkemSDph(formJson: Record<string, unknown>): number {
  const vatRate = parseAdmfVatRatePercent(formJson.vatRate);
  const bez = computeAdmfCelkemBezDph(formJson);
  return Math.round(bez * (1 + vatRate / 100));
}
```

Where `sumProductRowsBezDph` sums `(cenaPoSleve ?? 0) * (ks ?? 1)` over `productRows`.

**Financial interpretation:**

- **Celkem bez DPH** = products + montáž − OVT − MNG (all amounts bez DPH, floor at 0).
- **Celkem s DPH** = `round(celkemBezDph * (1 + vatRate/100))` — **single rate on the whole net** in this model (no mixed rates in one form).

### 6.3 Deposit and balance (s DPH)

| JSON key | Type | Meaning |
|----------|------|---------|
| `zalohovaFaktura` | `number` | **Deposit / proforma amount including VAT** (what customer pays upfront). |
| `doplatek` | `number` | **Balance including VAT**; usually `max(0, celkemSDph - zalohovaFaktura)` — may be persisted on save. |
| `variabilniSymbol` | `number` | Payment reference; often derived from phone digits in UI. |

If `doplatek` is missing, recompute from `computeAdmfCelkemSDph` and `zalohovaFaktura` the same way as `AdmfFormClient` / PDF.

### 6.4 Other payment / scheduling fields

| JSON key | UI label | Type / values |
|----------|----------|----------------|
| `kObjednani` | K objednání | `"Celá zakázka"` \| `"Část zakázky"` |
| `zalohaZaplacena` | Záloha zaplacena | See §9.2 |
| `infoKZaloze`, `infoKFakture` | Info k záloze / faktuře | Free text |
| `predpokladanaDodaciDoba`, `predpokladanaDobaMontaze` | Delivery / install ETA | Free text |
| `datum` | Datum | Typically `YYYY-MM-DD` (ISO date string) |
| `podpisZakaznika`, `jmenoPodpisZprostredkovatele` | Sign-off | Text; mediator name may be prefilled from auth |

**Types only (may be absent in UI):** `vybranaCastka`, `castkaDoplatku`, `kodTerminalu`, `dobaMontaze` — reserved or legacy; safe to ignore unless your import finds them populated.

---

## 7. `pricingTrace` (audit, not UI)

Per-row optional `pricingTrace`:

- `trace_version`: `1`
- `automated`: snapshot from **extract-products** (pricing DB, dimensions, variant id, `cena` / `cenaPoSleve` at extraction time).
- `manual_edits[]`: appended when user changes `cena`, `sleva`, `ks`, or `surcharges` (debounced in UI).

Use this for **disputes, pricing audits, and reconciliation** — not for statutory invoicing math (use current row numbers + §6.2).

Backend field definitions: `backend/src/types/extract-products.types.ts`.

---

## 8. „Další informace“ and booleans

| JSON key | UI | Display convention |
|----------|-----|---------------------|
| `typZarizeni` | Typ zařízení | Select; stored **value** (see §9.1). Label „Nebytový prostor“ maps to value **`Nebytový protor`** (typo preserved for Raynet enum match). |
| `parkovani` | Parkování | `true` → „OK“, `false` → „Špatné“ (PDF). |
| `zv` | ZV | `"?"` \| `"Ano"` \| `"Ne"` |
| `maZakaznikVyfocenouLamelu` | Vyfocená lamela | Boolean → Ano/Ne |
| `zvonek` | Jméno na zvonku | Text |
| `patro` | Patro | Text |
| `infoKParkovani` | Info k parkování | Text |

---

## 9. Enumerated strings (exact equality)

Integrators should compare **exact strings** — exports to Raynet/ERP depend on them.

### 9.1 `typZarizeni` (stored values)

`RD`, `Byt`, `Nebytový protor`, `chata`, `vila`, `Obytná maringotka`

### 9.2 `zalohaZaplacena`

`Hotově`, `Terminálem`, `QR`, `Fakturou`, `převodem`

**ERP slug mapping** (for reference): `backend/src/services/erp-export.service.ts` maps these to `hotove`, `terminalem`, `qr-kod`, `prevodem`, and maps `Fakturou` → `prevodem` with an internal warning flag.

### 9.3 `typOsoby`

`soukroma`, `pravnicka`

### 9.4 `typProstoru`

`bytovy`, `nebytovy`

---

## 10. Notes and legacy keys

| JSON key | Meaning |
|----------|---------|
| `poznamkyVyroba`, `poznamkyMontaz` | Primary note fields (výroba / montáž). |
| `doplnujiciInformaceObjednavky`, `doplnujiciInformaceMontaz` | Legacy aliases; may still exist in old JSON. Prefer the `poznamky*` keys when both exist. |

---

## 11. How the OVT frontend loads and shows data

1. **Server:** `frontend/src/app/orders/[id]/forms/[formId]/page.tsx` loads the form; for `admf`, casts `form_json` to `AdmfFormData`.
2. **Client:** `AdmfFormClient` merges order customer into empty fields, computes totals with the same logic as §6 (local `computeAdmfOrderTotals`), and keeps `doplatek` in sync on save.
3. **Display:** Sections match this document: customer → další informace → product table → montáž/slevy → poznámky → přílohy → platba a montáž.

**Attachments** are **not** inside `form_json`; they are separate MinIO-backed records keyed by `formId`.

---

## 12. Reference implementations for office / financial systems

| Concern | Code |
|---------|------|
| Totals bez/s DPH | `backend/src/utils/admf-order-totals.ts` |
| Customer-facing PDF layout & labels | `backend/src/services/admf-pdf.service.ts` |
| Raynet custom-field mapping | `backend/src/services/raynet-export.service.ts` (`buildRaynetPayload`) |
| ERP column mapping | `backend/src/services/erp-export.service.ts` (`buildErpPayloads`) |
| Product line extraction | `backend/src/services/extract-products.service.ts` |

**Recommendation:** For accounting, **recompute** `celkemBezDph` / `celkemSDph` with the functions in §6 from stored JSON rather than trusting any cached copy unless you version and hash the payload.

---

## 13. Minimal JSON example (illustrative)

```json
{
  "name": "Varianta 1",
  "source_form_ids": [42],
  "jmenoPrijmeni": "Jan Novák",
  "email": "jan@example.cz",
  "telefon": "+420 123 456 789",
  "ulice": "Hlavní 1",
  "mesto": "Praha",
  "psc": "12000",
  "typOsoby": "soukroma",
  "productRows": [
    {
      "id": "row-1",
      "produkt": "Horizontální žaluzie PRIM 800×1200",
      "ks": 2,
      "cena": 5000,
      "sleva": 10,
      "cenaPoSleve": 4500,
      "priceAffectingFields": [
        { "code": "type", "label": "Typ", "value": "PRIM" },
        { "code": "color", "label": "Barva", "value": "Bílá" }
      ]
    }
  ],
  "montazCenaZpusob": "auto",
  "montazCenaBezDph": 1339,
  "mngSleva": false,
  "ovtSlevaCastka": 0,
  "vatRate": 12,
  "platceDph": false,
  "typProstoru": "bytovy",
  "typZarizeni": "Byt",
  "parkovani": true,
  "zv": "?",
  "zalohovaFaktura": 5000,
  "doplatek": 7020,
  "kObjednani": "Celá zakázka",
  "zalohaZaplacena": "Hotově",
  "datum": "2026-04-06"
}
```

(Numbers are illustrative; recompute totals from your business rules.)

---

## 14. API surface (read path)

Forms are exposed via authenticated REST (see Swagger on the backend). Typical shape:

- `GET /api/forms/:id` → `{ form_type, form_json, order_id, ... }`

Only rows with `form_type === "admf"` carry this schema. **`custom`** forms use a different `form_json` shape (`schema` + `data`); do not parse them with this document.
