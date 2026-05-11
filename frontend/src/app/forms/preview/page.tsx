"use client";

/**
 * Form preview shell. Embedded in an iframe by the validation-products admin
 * app so admins can see how their just-edited validated_payload will render
 * in OVT (DynamicProductForm) before saving.
 *
 * Bootstrapping: the parent admin window posts the payload over postMessage
 * (`{ kind: "set-payload", payload: ProductPayload }`). We synth a single
 * "preview product" entry so DynamicProductForm has something to render —
 * one room, one row, pre-selected to this product. No DB writes; no save bar.
 *
 * Origin policy: any origin can send a payload. Deliberate — the page only
 * renders the payload it receives, has no auth, makes no DB writes, and
 * exposes no user-specific data. The worst a malicious sender can do is
 * cause their own data to render in this user-initiated iframe, which is
 * exactly what the page is for.
 */

import { useEffect, useMemo, useState } from "react";
import DynamicProductForm, {
  buildInitialFormData,
} from "@/components/forms/DynamicProductForm";
import { emptyValuesForProductSchema } from "@/lib/merge-product-switch";
import type {
  CatalogFormRow,
  JsonSchemaFormData,
  ProductPayload,
  Room,
} from "@/types/json-schema-form.types";

const PREVIEW_PRICING_ID = "__preview__";

interface IncomingMessage {
  kind?: string;
  payload?: ProductPayload;
}

function isPayloadShape(v: unknown): v is ProductPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.product_code !== "string") return false;
  if (!o.enums || typeof o.enums !== "object") return false;
  // form_body or zahlavi must have something to render
  const fb = o.form_body as { Properties?: unknown[] } | undefined;
  const zh = o.zahlavi as { Properties?: unknown[] } | undefined;
  return Boolean(
    (fb && Array.isArray(fb.Properties) && fb.Properties.length > 0) ||
      (zh && Array.isArray(zh.Properties) && zh.Properties.length > 0)
  );
}

export default function FormPreviewPage() {
  const [schema, setSchema] = useState<ProductPayload | null>(null);
  const [productSchemas, setProductSchemas] = useState<Record<string, ProductPayload>>({});
  const [formData, setFormData] = useState<JsonSchemaFormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent<IncomingMessage>) {
      const data = event.data;
      if (!data || data.kind !== "set-payload") return;
      const payload = data.payload;
      if (!isPayloadShape(payload)) {
        setError("Přijatý payload nemá platnou strukturu (chybí product_code / form_body / enums).");
        return;
      }

      // Index by synthetic id; mark schema with the same id so DynamicProductForm
      // can resolve "first row's product" to this payload.
      const schemaWithId: ProductPayload = {
        ...payload,
        _product_pricing_id: PREVIEW_PRICING_ID,
      };
      const newProductSchemas = { [PREVIEW_PRICING_ID]: schemaWithId };

      // Build initial form data with one preview room containing one pre-filled row.
      const base = buildInitialFormData(schemaWithId);
      const previewRow: CatalogFormRow = {
        id: `preview-row-${Date.now()}`,
        product_pricing_id: PREVIEW_PRICING_ID,
        values: emptyValuesForProductSchema(schemaWithId),
      };
      const previewRoom: Room = {
        id: `preview-room-${Date.now()}`,
        name: "Náhled",
        rows: [previewRow],
      };
      const seededData: JsonSchemaFormData = {
        ...base,
        rooms: [previewRoom],
      };

      setSchema(schemaWithId);
      setProductSchemas(newProductSchemas);
      setFormData(seededData);
      setError(null);
      setHasInitialized(true);
    }

    window.addEventListener("message", onMessage);
    // Tell the parent we're ready — parent listens for this and then posts the payload.
    if (window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ kind: "preview-ready" }, "*");
      } catch {
        // ignore — parent may be cross-origin and reject
      }
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const banner = useMemo(
    () => (
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Náhled formuláře — bez ukládání. Vyplňte pole pro otestování chování
        validací; výsledek se nikam neuloží.
      </div>
    ),
    []
  );

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50">
        {banner}
        <div className="mx-auto max-w-3xl p-6">
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!hasInitialized || !schema || !formData) {
    return (
      <main className="min-h-screen bg-gray-50">
        {banner}
        <div className="mx-auto max-w-3xl p-6 text-sm text-gray-500">
          Čekám na payload z administrace…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      {banner}
      <div className="mx-auto max-w-7xl p-4">
        <DynamicProductForm
          headerSchema={schema}
          productSchemas={productSchemas}
          setProductSchemas={setProductSchemas}
          formData={formData}
          setFormData={
            setFormData as React.Dispatch<React.SetStateAction<JsonSchemaFormData>>
          }
          shouldPinHeaderToFirstProduct={false}
          onPinHeaderFromProduct={setSchema}
        />
      </div>
    </main>
  );
}
