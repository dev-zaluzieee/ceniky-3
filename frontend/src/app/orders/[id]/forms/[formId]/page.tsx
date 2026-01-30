/**
 * Edit form under order: /orders/[orderId]/forms/[formId]
 * Fetches form, validates it belongs to the order, fetches order for customer display,
 * then renders the correct form client with orderId + customerFromOrder (read-only customer block).
 */

import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchFormByIdServer } from "@/lib/forms-server";
import { fetchOrderByIdServer } from "@/lib/orders-server";
import type { FormType } from "@/lib/forms-api";
import HorizontalniZaluzieFormClient from "@/app/forms/horizontalni-zaluzie/HorizontalniZaluzieFormClient";
import PliseZaluzieFormClient from "@/app/forms/plise-zaluzie/PliseZaluzieFormClient";
import SiteFormClient from "@/app/forms/site/SiteFormClient";
import TextileRoletyFormClient from "@/app/forms/textile-rolety/TextileRoletyFormClient";
import UniversalFormClient from "@/app/forms/universal/UniversalFormClient";
import AdmfFormClient from "@/app/forms/admf/AdmfFormClient";
import type { HorizontalniZaluzieFormData } from "@/types/forms/horizontalni-zaluzie.types";
import type { PliseZaluzieFormData } from "@/types/forms/plise-zaluzie.types";
import type { SiteFormData } from "@/types/forms/site.types";
import type { TextileRoletyFormData } from "@/types/forms/textile-rolety.types";
import type { UniversalFormData } from "@/types/forms/universal.types";
import type { AdmfFormData } from "@/types/forms/admf.types";

const VALID_FORM_TYPES: FormType[] = [
  "horizontalni-zaluzie",
  "plise-zaluzie",
  "site",
  "textile-rolety",
  "universal",
  "admf",
];

function normalizeRooms<T extends { rooms?: { rows?: unknown[] }[] }>(data: T): T {
  if (!data.rooms) data.rooms = [];
  (data.rooms as { rows?: unknown[] }[]) = data.rooms.map((room) => ({
    ...room,
    rows: room.rows || [],
  }));
  return data;
}

export default async function OrderFormEditPage({
  params,
}: {
  params: Promise<{ id: string; formId: string }>;
}) {
  const session = await getServerSession(authOptions);
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

  switch (formType) {
    case "horizontalni-zaluzie": {
      const initialData = normalizeRooms(form.form_json as HorizontalniZaluzieFormData);
      return (
        <HorizontalniZaluzieFormClient
          initialData={initialData}
          formId={formId}
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    }
    case "plise-zaluzie": {
      const initialData = normalizeRooms(form.form_json as PliseZaluzieFormData);
      return (
        <PliseZaluzieFormClient
          initialData={initialData}
          formId={formId}
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    }
    case "site": {
      const initialData = normalizeRooms(form.form_json as SiteFormData);
      return (
        <SiteFormClient
          initialData={initialData}
          formId={formId}
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    }
    case "textile-rolety": {
      const initialData = normalizeRooms(form.form_json as TextileRoletyFormData);
      return (
        <TextileRoletyFormClient
          initialData={initialData}
          formId={formId}
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    }
    case "universal": {
      const initialData = normalizeRooms(form.form_json as UniversalFormData);
      return (
        <UniversalFormClient
          initialData={initialData}
          formId={formId}
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    }
    case "admf": {
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
    default:
      notFound();
  }
}
