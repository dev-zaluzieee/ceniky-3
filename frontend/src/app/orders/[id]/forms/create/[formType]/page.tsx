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
  searchParams: Promise<{ formIds?: string }>;
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

    const productRows: AdmfProductRow[] = (extractRes.success && extractRes.data?.products
      ? extractRes.data.products
      : []
    ).map((p, i) => ({
      id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
      produkt: p.produkt,
      ks: p.ks,
      ram: p.ram ?? "",
      lamelaLatka: p.lamelaLatka ?? "",
      cena: p.cena,
      sleva: p.sleva,
      cenaPoSleve: p.cenaPoSleve,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const initialData = {
      name: variantaName,
      source_form_ids: extractRes.success && extractRes.data?.source_form_ids ? extractRes.data.source_form_ids : [],
      productRows,
      jmenoPrijmeni: order.name ?? undefined,
      email: order.email ?? undefined,
      telefon: order.phone ?? undefined,
      ulice: order.address ?? undefined,
      mesto: order.city ?? undefined,
      doplnujiciInformaceObjednavky: "",
      doplnujiciInformaceMontaz: "",
      montazCenaBezDph: 1339,
      platceDph: false,
      faktura: true,
      nebytovyProstor: false,
      bytovyProstor: true,
      vatRate: 12 as const,
      zalohovaFaktura: 0,
      datum: today,
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
