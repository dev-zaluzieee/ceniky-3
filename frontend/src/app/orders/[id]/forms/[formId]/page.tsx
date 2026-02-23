/**
 * Edit form under order: /orders/[orderId]/forms/[formId]
 * Renders CustomFormClient or AdmfFormClient based on form_type.
 */

import { redirect, notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { fetchFormByIdServer } from "@/lib/forms-server";
import { fetchOrderByIdServer } from "@/lib/orders-server";
import type { FormType } from "@/lib/forms-api";
import AdmfFormClient from "@/app/forms/admf/AdmfFormClient";
import CustomFormClient from "@/app/forms/custom/CustomFormClient";
import type { AdmfFormData } from "@/types/forms/admf.types";
import type { CustomFormJson } from "@/types/json-schema-form.types";

const VALID_FORM_TYPES: FormType[] = ["custom", "admf"];

export default async function OrderFormEditPage({
  params,
}: {
  params: Promise<{ id: string; formId: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const { id: orderIdParam, formId: formIdParam } = await params;
  const orderId = parseInt(orderIdParam, 10);
  const formId = parseInt(formIdParam, 10);

  if (isNaN(orderId) || isNaN(formId)) notFound();

  const formResponse = await fetchFormByIdServer(formId);
  if (!formResponse.success || !formResponse.data) {
    if (formResponse.error === "Form not found") notFound();
    redirect("/forms/list?error=fetch_failed");
  }

  const form = formResponse.data;

  if (form.order_id !== orderId) {
    notFound();
  }

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

  const formType = form.form_type as FormType;
  if (!VALID_FORM_TYPES.includes(formType)) notFound();

  if (formType === "custom") {
    const initialData = form.form_json as CustomFormJson | undefined;
    if (!initialData?.schema || !initialData?.data) notFound();
    return (
      <CustomFormClient
        orderId={orderId}
        formId={formId}
        initialData={initialData}
        customerFromOrder={customerFromOrder}
      />
    );
  }

  if (formType === "admf") {
    const initialData = form.form_json as AdmfFormData;
    return (
      <AdmfFormClient
        initialData={initialData}
        formId={formId}
        orderId={orderId}
        customerFromOrder={customerFromOrder}
      />
    );
  }

  notFound();
}
