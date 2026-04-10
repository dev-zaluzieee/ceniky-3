# Výrobní formulář (`form_type: custom`) — JSON specification

This document describes **custom product forms** (výrobní / step-1 forms) as stored in the database and rendered in OVT. The structure is **partly fixed** (wrapper, sections, `data` shape) and **partly dynamic** (property `Code`s, enums, and row fields come from the pricing export / pasted JSON).

**Multiple products per form:** Each **row** can reference a different catalog product (`product_pricing_id`). Full OVT payloads for those products are stored in **`product_schemas`**. Top-level **`schema`** defines **záhlaví / zápatí** only (from the **first** catalog selection when the form was created; it does not change when other products are added to rows).

**Canonical TypeScript types:** `frontend/src/types/json-schema-form.types.ts` (`ProductPayload`, `JsonSchemaFormData`, `CustomFormJson`, `CatalogFormRow`, `Room`).

**Storage:** table `forms`, `form_json` is a single object:

```json
{
  "schema": { /* ProductPayload — header/footer template */ },
  "product_schemas": { /* Record<product_pricing_id, ProductPayload> */ },
  "data": { /* JsonSchemaFormData */ }
}
```

`form_type` must be `'custom'`. Anything else (e.g. ADMF) uses a different `form_json` shape — see `docs/admf-form-json-spec.md`.

---

## 1. End-to-end role in the system

1. **Header schema (`schema`):** From the **first catalog pick** (or paste-then-first-catalog pick), OVT keeps **`zahlavi`**, **`zapati`**, their **`enums`**, and related **`dependencies`** for header/footer fields. **`data.zahlaviValues` / `zapatiValues`** align with this `schema`.
2. **Per-row schemas (`product_schemas`):** For each distinct `product_pricing.id` used on any row, the app stores the merged catalog payload (same shape as the former single-product `schema`: `form_body`, `enums`, `dependencies`, `_product_pricing_id`, `price_affecting_enums`, `surcharge_properties`, `_product_manufacturer`, …).
3. **Schema source for rows:** **Catalog** via `getPricingFormById` → merged into `product_schemas[id]`. **Paste** JSON alone does not set `_product_pricing_id` on the header until the user adds the first row from the catalog (header is then replaced from that product).
4. **User fills** `data`: customer block, záhlaví/zápatí values, and **rooms × rows**; each row holds **`values`** (form_body fields only) plus **`product_pricing_id`**.
5. **Persist:** `{ schema, product_schemas, data }` is saved as `form_json`.
6. **Downstream:** **Extract products** (`backend/src/services/product-extractors.ts`) walks each row, resolves **`row.product_pricing_id`**, loads **`product_schemas[id]`** (or legacy fallback to top `schema` when ids match), flattens **`values`** for dimension/selector reads, and produces ADMF lines (+ `pricingTrace`). Row **display name** for the extracted label comes from **that row’s** schema (`displayNameFromRowSchema`).

External tools should treat **`product_schemas`** as the dictionary for **row** columns, **`schema`** for **záhlaví/zápatí** only, and **`data`** as the filled values.

---

## 2. Vazba na ADMF — propojení výrobních a administrativního formuláře

Tato sekce popisuje **konkrétní mechanismus** v aplikaci: jak se z uložených výrobních formulářů (`forms.id`, `form_type: custom`) stane nový ADMF a kde se tato vazba zapisuje.

### 2.1 Kde je „link“ uložený

- **Na straně ADMF:** pole **`form_json.source_form_ids`** — pole celých čísel (`number[]`), každé číslo je **`forms.id`** jednoho výrobního formuláře.
- **Na straně výrobního formuláře:** v `form_json` **žádný zpětný odkaz na ADMF není** — vazba je jednosměrná (ADMF → seznam zdrojových formulářů).
- V databázi **není samostatná join tabulka**; integrátor musí číst `source_form_ids` z ADMF `form_json`.

### 2.2 OVT: vytvoření ADMF z vybraných výrobních formulářů

1. Na detailu zakázky uživatel vybere jeden nebo více výrobních formulářů a otevře vytvoření ADMF.
2. Aplikace naviguje na:

   `GET /orders/{orderId}/forms/create/admf?formIds={id1},{id2},…`

   kde **`formIds`** je **povinný** query parametr: čárkou oddělené ID výrobních formulářů (stejná ID jako v tabulce `forms`).

   Implementace odkazu: `frontend/src/app/orders/[id]/OrderDetailClient.tsx` (např. `href=.../forms/create/admf?formIds=...`).

3. Pokud `formIds` chybí nebo po parsování nezbude žádné platné ID, serverová stránka **přesměruje** na detail zakázky (`frontend/src/app/orders/[id]/forms/create/[formType]/page.tsx`).

### 2.3 Volání extrakce (server → backend)

Při renderu stránky vytvoření ADMF Next.js zavolá:

- `fetchExtractProductsServer(orderId, formIds)` → **`GET /api/orders/{orderId}/extract-products?formIds={id1},{id2},…`**

  (`frontend/src/lib/orders-server.ts`, `backend/src/routes/orders.routes.ts`)

Odpověď má tvar:

```json
{
  "success": true,
  "data": {
    "products": [ /* ExtractedProductLine[] */ ],
    "source_form_ids": [ 12, 15 ]
  }
}
```

### 2.4 Backend logika: které formuláře se berou a co je v `source_form_ids`

Implementace: `backend/src/services/extract-products.service.ts` (`extractProductsForOrder`).

- **Step 1 typy** jsou definované jako `STEP1_FORM_TYPES = ["custom"]` (`backend/src/types/forms.types.ts`) — extrakce se týká **jen** `form_type: custom`.
- Když klient pošle **`formIds`**:
  - Načtou se formuláře uživatele pro danou zakázku (`order_id` shoda).
  - Vyfiltrují se jen záznamy, jejichž `id` je v množině `formIds`, patří k dané zakázce a mají `form_type` ve `STEP1_FORM_TYPES`.
  - Pokud **po filtru počet nesedí** s počtem zadaných ID (některé ID neexistuje, není na zakázce, nebo není `custom`), API vrátí chybu **`INVALID_FORM_IDS`** (`BadRequestError`).
- Když klient **`formIds` nepošle** (prázdný / vynechaný query): vezme se **všech** step-1 formulářů na zakázce. *(Stránka vytvoření ADMF v OVT ale `formIds` vždy posílá.)*

**Sestavení `source_form_ids` v odpovědi (důležité):**

- Pro každý takto vybraný výrobní formulář se zavolá `extractProductsFromForm` (`product-extractors.ts`).
- Do pole `source_form_ids` se **`forms.id` přidá jen tehdy**, když z daného formuláře vzešla **alespoň jedna** produktová řádka (`lines.length > 0`).
- Důsledek: uživatel mohl v URL vybrat formulář, ale pokud z něj extrakce **nevytvoří žádný řádek** (prázdné místnosti, chybějící ceník, chyba při výpočtu atd.), toto ID se v **`source_form_ids` v odpovědi neobjeví** — nemusí být tedy 1:1 s query parametrem `formIds`.

Požadavek na ceník: bez nakonfigurovaného pricing DB poolu (`PRICING_DATABASE_URL`) extrakce selže globálně.

**Extrakce a `product_schemas`:** Každý řádek musí mít **`product_pricing_id`** a v `form_json` musí existovat **`product_schemas[product_pricing_id]`** s kompletní šablonou produktu. Jinak backend vyhodí chybu (nebo při shodě id s `schema._product_pricing_id` použije top-level `schema` — viz §12.1 legacy).

### 2.5 Předvyplnění nového ADMF

`frontend/src/app/orders/[id]/forms/create/[formType]/page.tsx`:

- Z odpovědi extrakce vezme **`data.source_form_ids`** a uloží je do inicializačního ADMF payloadu jako **`source_form_ids`**.
- Pole **`productRows`** naplní z `data.products` (nové klientské `id` pro každý řádek; ceny a `pricingTrace` z extrakce).

Po uložení ADMF do DB zůstává **`source_form_ids` součástí `form_json`** u záznamu s `form_type: admf`.

### 2.6 Stopování původu řádků (audit)

U každé vytěžené řádky má `pricingTrace.automated` (viz `docs/admf-form-json-spec.md` / typy v `extract-products.types.ts`) mimo jiné:

- **`source_form_id`** — z kterého výrobního formuláře (`forms.id`) řádka pochází,
- **`room_index`**, **`row_index`**, případně **`room_name`** — mapování na `data.rooms[]` ve zdrojovém `form_json`,
- **`product_pricing_id`** — který katalogový produkt byl u řádku použit.

To umožňuje dohledat konkrétní řádek ve výrobním formuláři i bez dalšího DB vztahu.

### 2.7 Downstream použití `source_form_ids`

- **ERP export z ADMF** (`backend/src/services/erp-export.service.ts`): pro doplnění výrobce u produktů se zkusí načíst **`forms` záznam `source_form_ids[0]`** a z jeho **`form_json.schema._product_manufacturer`** vzít výrobce (hlavičkový první produkt). Záleží tedy na pořadí ID v poli a na tom, že první zdrojový formulář má po vytvoření z katalogu vyplněný manufacturer.

---

## 3. Top level: `CustomFormJson`

| Key | Type | Meaning |
|-----|------|---------|
| `schema` | `ProductPayload` | **Záhlaví / zápatí** template: `zahlavi`, `zapati`, `enums` for those sections, `dependencies` affecting them. From **first** catalog selection; not swapped when adding other row products. |
| `product_schemas` | `Record<string, ProductPayload>` | Key = `product_pricing.id` (string). Full merged OVT payload per product used on at least one row (`form_body`, row `enums`, `price_affecting_enums`, `surcharge_properties`, …). |
| `data` | `JsonSchemaFormData` | User-entered values: customer, `zahlaviValues` / `zapatiValues` (vs `schema`), `rooms` with **`CatalogFormRow`** lines. |

---

## 4. `schema` (`ProductPayload`) — header / footer template

In the multi-product model, **`schema` is authoritative for záhlaví and zápatí only** in the UI. It still carries a full `ProductPayload` shape (often identical to the first product picked from the catalog) so that **`enums`** and **`dependencies`** for header/footer fields resolve correctly.

### 4.1 Core fields (from export / paste / first catalog)

| Key | Type | Required for OVT UI | Meaning |
|-----|------|---------------------|---------|
| `product_code` | `string` | yes | Stable identifier; shown in „Produkt (hlavička)“ and list fallbacks. |
| `enums` | `Record<string, EnumEntry>` | yes | Used for **záhlaví/zápatí** fields (and may mirror the first product). |
| `form_body` | `SectionBlock` | optional on header-only mental model | May be present on stored `schema`; **row columns** come from **`product_schemas[row.product_pricing_id].form_body`**. |
| `zahlavi` | `SectionBlock` | no | Header section: `data.zahlaviValues`. |
| `zapati` | `SectionBlock` | no | Footer section: `data.zapatiValues`. |
| `dependencies` | `PayloadDependency[]` | no | Apply to header/footer and/or row schemas per stored payload. |
| `downloaded_at` | `string` | no | Metadata from export tool. |
| `_metadata` | `object` | no | Opaque metadata. |

Minimum validation in the app (`CustomFormClient.tsx`) on **paste**: `product_code` (string), `enums` (object), `form_body.Properties` (non-empty array).

### 4.2 `SectionBlock`

| Key | Meaning |
|-----|---------|
| `Code` | Section code (informational). |
| `Name` | Section title; used for **product display name** fallback (see §9). |
| `Properties` | Array of **property definitions** (columns or header/footer fields). |

### 4.3 `PropertyDefinition` (per field in a section)

| Key | Type | Meaning |
|-----|------|---------|
| `ID` | `string` | Stable id from source system. |
| `Code` | `string` | **Storage key** in `zahlaviValues`, `zapatiValues`, or **`row.values`** for form_body. |
| `Name` | `string` | Default human label. |
| `DataType` | `"text" \| "numeric" \| "boolean" \| "enum" \| "textarea" \| "link"` | Drives control type in UI. |
| `Value` | optional | Default value when creating empty state. |
| `label-form` | optional | Overrides label in the form UI when set. |

**Runtime extensions:** Payloads from the export tool may include extra keys on a property (e.g. inline enum lists). The backend extractor uses `EnumValues` on a definition to map enum **codes** to **display names** when building ADMF `priceAffectingFields`. If absent, the raw stored value is shown.

### 4.4 OVT / pricing extensions on **`product_schemas` entries** (and typically mirrored on first `schema`)

These are **merged when picking a product from the catalog** for a row (and on first pick for the header):

| Key | Meaning |
|-----|---------|
| `_product_pricing_id` | UUID/string of `product_pricing.id` — **required** for server-side price extraction for that row. |
| `_product_manufacturer` | Manufacturer string — ERP export may use first source form’s header `schema`. |
| `price_affecting_enums` | `string[]` — property codes required per **that** row for pricing. |
| `surcharge_properties` | `string[]` — příplatky for **that** product; amounts from pricing DB `surcharges`. |

**Legacy:** Extraction still accepts top-level `schema._product_pricing_id` / `data.product_pricing_id` when resolving a row’s id if **`product_schemas`** is missing or incomplete (see §12.1).

---

## 5. `product_schemas`

- **Keys:** `product_pricing.id` (same string as `CatalogFormRow.product_pricing_id`).
- **Values:** Full `ProductPayload` as returned from the pricing API merge (`ovt_export_json` + `_product_pricing_id`, `price_affecting_enums`, `_product_manufacturer`, …).
- **Rule:** Every `product_pricing_id` appearing in **`data.rooms[].rows[]`** should have a corresponding entry. The OVT client adds/updates entries when the user picks or switches a product (`DynamicProductForm`, `merge-product-switch`).

---

## 6. `data` (`JsonSchemaFormData`) — fixed shape

| Key | Type | Meaning |
|-----|------|---------|
| `name` | `string` | Customer / contact name (základní údaje). |
| `email` | `string` | |
| `phone` | `string` | |
| `address` | `string` | Street / line 1. |
| `city` | `string` | |
| `productCode` | `string` | Copy of header `schema.product_code` at init (first product). |
| `productName` | `string` | Human title from first catalog header; list views (`parseForm`). |
| `zahlaviValues` | `Record<string, string \| number \| boolean>` | Keys = `schema.zahlavi.Properties[].Code`. |
| `zapatiValues` | same | Keys = `schema.zapati.Properties[].Code`. |
| `rooms` | `Room[]` | Místnosti; each room has **`CatalogFormRow`** lines. |

### 6.1 `Room`

| Key | Type | Meaning |
|-----|------|---------|
| `id` | `string` | Client-generated stable id (`id-{timestamp}-…`). |
| `name` | `string` | Room label (e.g. „Obývák“); used in pricing trace and validation messages. |
| `rows` | `CatalogFormRow[]` | Product lines; **each row can be a different `product_pricing_id`**. |

### 6.2 `CatalogFormRow`

| Key | Type | Meaning |
|-----|------|---------|
| `id` | `string` | Client-generated row id. |
| `product_pricing_id` | `string` | `product_pricing.id`; must exist in **`product_schemas`**. |
| `values` | `Record<string, string \| number \| boolean>` | **Form_body** fields only: keys = `product_schemas[product_pricing_id].form_body.Properties[].Code`. |
| `linkGroupId` | `string` | Optional — when a **`link`**-type column is on, linked rows share a group id. |

**Quantity:** Backend extraction reads `ks`, then `kus`, then `quantity` from the **flattened** row (i.e. from **`values`**). The UI may expose a column with code `ks` — then it is part of the **effective required set** for **that row’s** schema (§8).

**Dimensions for pricing:** Width and height are read from the flattened `values` using the same property **codes** as before:

- Width: `ovl_sirka`, `width`, `Sirka`, `sirka`, `šířka`
- Height: `ovl_vyska`, `height`, `Vyska`, `vyska`, `výška`

Values are strings or numbers interpretable as **millimetres**.

### 6.3 Legacy flat rows (read compatibility)

Older saves used a single global `schema` and **flat** rows (`id` + dynamic codes on the row object). On load, **`normalizeCustomFormOnLoad`** (`frontend/src/lib/normalize-custom-form-load.ts`) can fold those into **`values`** + **`product_schemas[schema._product_pricing_id]`**. New saves always use **`CatalogFormRow`**.

---

## 7. Enums and dependencies

### 7.1 `enums` object

- **Header/footer:** use **`schema.enums`** with `zahlavi` / `zapati` property codes.
- **Rows:** use **`product_schemas[row.product_pricing_id].enums`** with that product’s `form_body` codes.

Each value is an `EnumEntry`: at least `default: EnumValue[]`; optional extra arrays keyed by **group** name.

`EnumValue` (simplified):

| Field | Meaning |
|-------|---------|
| `code` | **Stored in `row.values`** when user selects the option. |
| `name` | Display label in UI. |
| `groups` | Tags for grouping in export tooling. |
| `active` | If `false`, option hidden in OVT. |

**Interpretation:** Always persist and compare **enum `code`**, not `name`.

### 7.2 `PayloadDependency`

| Field | Meaning |
|-------|---------|
| `source_enum` | `Code` of controlling field (often enum). |
| `source_value` | When row[source_enum] equals this, rule applies. |
| `target_property` | `Code` of affected field. |
| `allowed_values` | Optional subset of enum codes allowed for target. |
| `field_disabled` | If `true`, target is treated as disabled and **excluded** from required-field validation. |

Row-level dependencies are evaluated against **`product_schemas[id].dependencies`** and the flattened row (`id` + `values` + optional `linkGroupId`).

---

## 8. What is “required” for a row (OVT + extraction)

**Pricing extraction** requires every code in **`product.price_affecting_enums`** (from the pricing DB for that `product_pricing_id`) to be non-empty on the flattened row (unless disabled by dependency).

The UI builds an **effective** required set **per row** using **`buildEffectiveRequiredFieldCodes`** on **that row’s** `form_body` codes and **`product_schemas[row.product_pricing_id].price_affecting_enums`** (`hasAnyMissingPriceAffectingFieldsMulti`, `frontend/src/lib/price-affecting-validation.ts`):

1. All `price_affecting_enums` for that product.
2. If `form_body` contains property code `ks` → **`ks` is required** (integer ≥ 1).
3. Every **width/height** alias present in **that** `form_body` → required (positive number, mm).

---

## 9. `DataType` → UI behaviour (how to render)

| `DataType` | Typical storage | Display hint |
|------------|-----------------|--------------|
| `text` | `string` | Single-line input. |
| `textarea` | `string` | Multiline. |
| `numeric` | `string` or `number` | Often stored as string `""` until filled; parse for validation. |
| `boolean` | `boolean` | Toggle. |
| `enum` | `string` (code) | Dropdown from **that row schema’s** `enums[Code]` + dependency filtering. |
| `link` | `boolean` | Enabling can insert a paired row with shared `linkGroupId`. |

**Labels:** Use `property["label-form"] ?? property.Name`.

---

## 10. Product display name

- **Header line in UI / lists:** `resolveProductNameFromPayload(schema)` → `data.productName` (`frontend/src/lib/resolve-product-name.ts`, `parseForm`).
- **Per row (OVT table block):** `resolveProductNameFromPayload(product_schemas[row.product_pricing_id])`.
- **Backend extract label** (`product-extractors.ts`): `displayNameFromRowSchema(rowSchema)` — same precedence as frontend: `form_body.Name` → `zahlavi.Name` → `zapati.Name` → `product_code` → `"Vlastní produkt"`.

---

## 11. Size limits (manufacturing / warranty)

Per row, when **`row.product_pricing_id`** and that product’s width/height columns are filled, the client calls the size-limits API with that **`product_pricing_id`**, dimensions, and **stringified `row.values`**. Results are **not** stored in `form_json`. Integrators need the same API or pricing DB rules per product.

---

## 12. Relation to ADMF and pricing

- **Propojení přes `source_form_ids` a extrakci:** viz **§2**.
- **No line totals in výrobní `form_json`:** Prices are resolved at extract time from the pricing DB.
- **Extract output:** `ExtractedProductLine[]` — label per **row product**, `ks`, `cena`, `sleva`, `cenaPoSleve`, `priceAffectingFields`, `pricingTrace`, surcharges.

### 12.1 Backend row resolution (`extractFromCustom`)

1. Read **`rawRow.product_pricing_id`** (or legacy fallbacks: **`schema._product_pricing_id`**, **`data.product_pricing_id`**).
2. **Flatten** for pricing: if **`rawRow.values`** is an object, merge into a single map (plus optional `linkGroupId`); else treat the row as legacy flat.
3. **`rowSchema` = `form_json.product_schemas[productPricingId]`**, or if missing and `productPricingId === schema._product_pricing_id`, use top **`schema`**.
4. **`surcharge_properties`** and **`findPropertyByCode`** use **`rowSchema`**, not only top `schema`.

If **`product_pricing_id`** is missing or **`rowSchema`** cannot be resolved, extraction **throws**.

---

## 13. OVT UX (product picker, switch, duplicate)

- **Add row (same product):** not a separate button; use **„Duplikovat řádek“** (copies `product_pricing_id`, `values`, and link-group behaviour).
- **Add another product:** **„Přidat produkt“** in a room opens the catalog picker (`ProductPickerModal`); first row on a paste-based form **pins** header `schema` + záhlaví/zápatí values from that catalog product.
- **Change product:** **„Změnit produkt“** → picker → **`mergeValuesForProductSwitch`** (`frontend/src/lib/merge-product-switch.ts`): copy fields where **Code + DataType** match; for **enum**, keep value only if it exists in the new product’s enum set; otherwise **`ProductSwitchLossModal`** lists data that will be dropped.

---

## 14. How to read a saved form (integration recipe)

1. Fetch form; ensure `form_type === "custom"`.
2. Parse `form_json.schema`, **`form_json.product_schemas`**, and `form_json.data`.
3. **Customer:** `data.name`, `email`, `phone`, `address`, `city`.
4. **Header/footer:** For each property in `schema.zahlavi?.Properties` / `schema.zapati?.Properties`, read `data.zahlaviValues[prop.Code]` / `data.zapatiValues[prop.Code]`; resolve enums with **`schema.enums`**.
5. **Rows:** For each `room` in `data.rooms`, for each `row` in `room.rows`:
   - Load **`ps = product_schemas[row.product_pricing_id]`**; if missing, handle legacy (§6.3).
   - For each `prop` in **`ps.form_body.Properties`**, read **`row.values[prop.Code]`**.
   - For enums, map code → name using **`ps.enums[prop.Code]`**.
6. **Line identity:** `(room.id, row.id)`; stable for the lifetime of the saved document.

---

## 15. Reference implementation map

| Topic | Location |
|-------|----------|
| Types | `frontend/src/types/json-schema-form.types.ts` |
| Initial `data` (empty rooms) | `buildInitialFormData` in `frontend/src/components/forms/DynamicProductForm.tsx` |
| Load normalization | `frontend/src/lib/normalize-custom-form-load.ts` |
| Product switch merge | `frontend/src/lib/merge-product-switch.ts` |
| Catalog → payload | `frontend/src/lib/product-schema-from-pricing-detail.ts` |
| Validation / required (multi) | `frontend/src/lib/price-affecting-validation.ts` |
| Main UI | `frontend/src/components/forms/DynamicProductForm.tsx` |
| Product picker / loss modals | `frontend/src/components/forms/ProductPickerModal.tsx`, `ProductSwitchLossModal.tsx` |
| Create/edit/save | `frontend/src/app/forms/custom/CustomFormClient.tsx` |
| Catalog merge | `CustomFormClient` + `getPricingFormById` (`frontend/src/lib/pricing-forms-api.ts`) |
| Server extract | `backend/src/services/product-extractors.ts` (`extractFromCustom`) |
| Extract pro zakázku + `source_form_ids` | `backend/src/services/extract-products.service.ts` |
| HTTP `GET .../extract-products` | `backend/src/routes/orders.routes.ts` |
| ADMF create | `frontend/src/app/orders/[id]/forms/create/[formType]/page.tsx` |
| Odkaz z detailu zakázky na ADMF | `frontend/src/app/orders/[id]/OrderDetailClient.tsx` |
| Výrobní PDF | `backend/src/services/custom-form-pdf.service.ts` |
| Pricing list / display name | `backend/src/services/pricing-forms.service.ts` |
| Debug JSON form | `frontend/src/app/debug/json-form/page.tsx` (synthetic `debug-local-schema` id) |

---

## 16. Minimal structural example (multi-product)

Two products in one room — illustrative UUIDs and shapes only.

```json
{
  "schema": {
    "product_code": "HZ-PRIM",
    "zahlavi": { "Code": "zh", "Name": "Hlavicka", "Properties": [] },
    "zapati": { "Code": "zp", "Name": "Patička", "Properties": [] },
    "enums": {},
    "form_body": { "Code": "body", "Name": "Horizontální žaluzie PRIM", "Properties": [] },
    "_product_pricing_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "_product_manufacturer": "Example s.r.o.",
    "price_affecting_enums": ["type", "color"],
    "surcharge_properties": []
  },
  "product_schemas": {
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": {
      "product_code": "HZ-PRIM",
      "form_body": {
        "Code": "body",
        "Name": "Horizontální žaluzie PRIM",
        "Properties": [
          { "ID": "1", "Code": "ovl_sirka", "Name": "Šířka mm", "DataType": "numeric" },
          { "ID": "2", "Code": "ovl_vyska", "Name": "Výška mm", "DataType": "numeric" },
          { "ID": "3", "Code": "ks", "Name": "Ks", "DataType": "numeric" },
          { "ID": "4", "Code": "type", "Name": "Typ", "DataType": "enum" },
          { "ID": "5", "Code": "color", "Name": "Barva", "DataType": "enum" }
        ]
      },
      "enums": {
        "type": { "default": [{ "code": "PRIM", "name": "PRIM", "groups": [] }] },
        "color": { "default": [{ "code": "WHITE", "name": "Bílá", "groups": [] }] }
      },
      "_product_pricing_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "price_affecting_enums": ["type", "color"],
      "surcharge_properties": []
    },
    "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb": {
      "product_code": "OTHER",
      "form_body": {
        "Code": "body",
        "Name": "Jiný produkt",
        "Properties": [
          { "ID": "1", "Code": "ovl_sirka", "Name": "Šířka mm", "DataType": "numeric" },
          { "ID": "2", "Code": "ovl_vyska", "Name": "Výška mm", "DataType": "numeric" },
          { "ID": "3", "Code": "ks", "Name": "Ks", "DataType": "numeric" }
        ]
      },
      "enums": {},
      "_product_pricing_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "price_affecting_enums": [],
      "surcharge_properties": []
    }
  },
  "data": {
    "name": "Jan Novák",
    "email": "jan@example.cz",
    "phone": "+420 123 456 789",
    "address": "Hlavní 1",
    "city": "Praha",
    "productCode": "HZ-PRIM",
    "productName": "Horizontální žaluzie PRIM",
    "zahlaviValues": {},
    "zapatiValues": {},
    "rooms": [
      {
        "id": "room-1",
        "name": "Obývák",
        "rows": [
          {
            "id": "row-1",
            "product_pricing_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "values": {
              "ovl_sirka": 800,
              "ovl_vyska": 1200,
              "ks": 2,
              "type": "PRIM",
              "color": "WHITE"
            }
          },
          {
            "id": "row-2",
            "product_pricing_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "values": {
              "ovl_sirka": 600,
              "ovl_vyska": 900,
              "ks": 1
            }
          }
        ]
      }
    ]
  }
}
```

---

## 17. API surface

Same forms API as ADMF:

- `GET /api/forms/:id` → `form_type`, `form_json`

For `custom`, interpret `form_json` as **`{ schema, product_schemas, data }`**. For listing human titles in UIs, prefer **`data.productName`** when present.

**Související endpoint pro ADMF prefill (neukládá výrobní formulář):**

- `GET /api/orders/:orderId/extract-products?formIds=…` — viz §2.3.
