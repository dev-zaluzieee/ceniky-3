/**
 * Create form under order: /orders/[orderId]/forms/create/[formType]
 * Form types: custom (paste JSON), admf (generated from selected custom forms).
 */

import { redirect, notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { fetchOrderByIdServer, fetchExtractProductsServer } from "@/lib/orders-server";
import { fetchFormsServer } from "@/lib/forms-server";
import type { FormType } from "@/lib/forms-api";
import type { AdmfProductRow } from "@/types/forms/admf.types";
import AdmfFormClient from "@/app/forms/admf/AdmfFormClient";
import CustomFormClient from "@/app/forms/custom/CustomFormClient";

const VALID_FORM_TYPES: FormType[] = ["custom", "admf"];

export default async function OrderFormCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; formType: string }>;
  searchParams: Promise<{
    formIds?: string;
    /** Optional ADMF parameter presets carried over from the form-level price preview. */
    vat?: string;
    montaz?: string;
    ovtSleva?: string;
    mngSleva?: string;
    mngSlevaActive?: string;
    /** % applied to every productRow's `sleva` (mirrors ADMF "Nastavit slevu všem"). */
    bulkSleva?: string;
  }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { id: orderIdParam, formType: formTypeParam } = await params;
  const orderId = parseInt(orderIdParam, 10);

  if (isNaN(orderId)) notFound();

  const formType = formTypeParam as FormType;
  if (!VALID_FORM_TYPES.includes(formType)) notFound();

  const orderResponse = await fetchOrderByIdServer(orderId);
  if (!orderResponse.success || !orderResponse.data) notFound();
  const order = orderResponse.data;

  const customerFromOrder = {
    name: order.name ?? undefined,
    email: order.email ?? undefined,
    phone: order.phone ?? undefined,
    address: order.address ?? undefined,
    city: order.city ?? undefined,
    zipcode: order.zipcode ?? undefined,
  };

  const resolvedSearchParams = await searchParams;
  const formIdsParam = resolvedSearchParams.formIds;
  const p = (resolvedSearchParams as Record<string, string | string[] | undefined>)["pricingId"];
  const pricingIdParam = typeof p === "string" ? p : undefined;

  if (formType === "custom") {
    return (
      <CustomFormClient
        orderId={orderId}
        customerFromOrder={customerFromOrder}
        pricingId={pricingIdParam?.trim() || undefined}
      />
    );
  }

  if (formType === "admf") {
    if (!formIdsParam || formIdsParam.trim() === "") {
      redirect(`/orders/${orderId}`);
    }
    const formIds = formIdsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    if (formIds.length === 0) {
      redirect(`/orders/${orderId}`);
    }

    const extractRes = await fetchExtractProductsServer(orderId, formIds);
    const formsRes = await fetchFormsServer({ order_id: orderId, form_type: "admf", limit: 100 });
    const existingAdmfCount = formsRes.success && formsRes.data ? formsRes.data.length : 0;
    const variantaName = `Varianta ${existingAdmfCount + 1}`;

    // If the OVT carried over a "Sleva pro všechny produkty (%)" from the
    // form-level price preview, apply it to every row at generation time —
    // mirrors what the ADMF's "Nastavit slevu všem" button does.
    const presetBulkSleva = (() => {
      const n = Number(resolvedSearchParams.bulkSleva);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : 0;
    })();

    const productRows: AdmfProductRow[] = (extractRes.success && extractRes.data?.products
      ? extractRes.data.products
      : []
    ).map((p, i) => {
      const slevaForRow = presetBulkSleva > 0 ? presetBulkSleva : p.sleva;
      const cenaPoSleveForRow =
        presetBulkSleva > 0 ? Math.round(p.cena * (1 - presetBulkSleva / 100)) : p.cenaPoSleve;
      return {
        // Generate a new stable row id for the client-side form.
        id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        produkt: p.produkt,
        ks: p.ks,
        cena: p.cena,
        sleva: slevaForRow,
        cenaPoSleve: cenaPoSleveForRow,
        baseCena: p.baseCena,
        surcharges: p.surcharges,
        surchargeWarnings: p.surchargeWarnings,
        priceAffectingFields: p.priceAffectingFields,
        pricingTrace: p.pricingTrace,
      };
    });

    const today = new Date().toISOString().slice(0, 10);
    const raynetName = session.user.raynet_name ?? undefined;

    // ADMF parameter presets carried over from the form-level price preview
    // ("Generovat ADMF s těmito parametry"). When the URL doesn't carry them,
    // we keep the legacy hardcoded fallbacks so direct generation still works.
    // ADMF vatRate is a strict 0 | 12 | 21 enum — snap any preset to the closest valid value.
    const presetVat: 0 | 12 | 21 = (() => {
      const n = Number(resolvedSearchParams.vat);
      if (!Number.isFinite(n)) return 12;
      if (n <= 6) return 0;
      if (n <= 16) return 12;
      return 21;
    })();
    const presetMontaz = (() => {
      const n = Number(resolvedSearchParams.montaz);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 1339;
    })();
    const presetOvtSleva = (() => {
      const n = Number(resolvedSearchParams.ovtSleva);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    })();
    const presetMngSlevaActive = resolvedSearchParams.mngSlevaActive === "1";
    const presetMngSleva = (() => {
      const n = Number(resolvedSearchParams.mngSleva);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    })();

    // When montáž is explicitly carried over, freeze it as 'manual' so the
    // ADMF totals function uses the value (rather than re-applying the legacy
    // auto default). Otherwise default to 'auto' for backwards compatibility.
    const montazFromPreview = resolvedSearchParams.montaz != null && Number.isFinite(Number(resolvedSearchParams.montaz));

    const initialData = {
      name: variantaName,
      source_form_ids: extractRes.success && extractRes.data?.source_form_ids ? extractRes.data.source_form_ids : [],
      productRows,
      jmenoPrijmeni: order.name ?? undefined,
      email: order.email ?? undefined,
      telefon: order.phone ?? undefined,
      ulice: order.address ?? undefined,
      mesto: order.city ?? undefined,
      psc: order.zipcode ?? undefined,
      poznamkyVyroba: "",
      poznamkyMontaz: "",
      montazCenaBezDph: presetMontaz,
      montazCenaZpusob: (montazFromPreview ? "manual" : "auto") as "manual" | "auto",
      ovtSlevaSDph: presetOvtSleva,
      mngSleva: presetMngSlevaActive,
      mngSlevaSDph: presetMngSleva,
      platceDph: false,
      faktura: true,
      typProstoru: "bytovy" as const,
      vatRate: presetVat as 0 | 12 | 21,
      zalohovaFaktura: 0,
      datum: today,
      jmenoPodpisZprostredkovatele: raynetName ?? "",
    };

    return (
      <AdmfFormClient
        initialData={initialData}
        orderId={orderId}
        customerFromOrder={customerFromOrder}
      />
    );
  }

  notFound();
}
