/**
 * Create form under order: /orders/[orderId]/forms/create/[formType]
 * Fetches order, passes orderId + customerFromOrder to the form client (create mode).
 */

import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchOrderByIdServer } from "@/lib/orders-server";
import type { FormType } from "@/lib/forms-api";
import HorizontalniZaluzieFormClient from "@/app/forms/horizontalni-zaluzie/HorizontalniZaluzieFormClient";
import PliseZaluzieFormClient from "@/app/forms/plise-zaluzie/PliseZaluzieFormClient";
import SiteFormClient from "@/app/forms/site/SiteFormClient";
import TextileRoletyFormClient from "@/app/forms/textile-rolety/TextileRoletyFormClient";
import UniversalFormClient from "@/app/forms/universal/UniversalFormClient";

const VALID_FORM_TYPES: FormType[] = [
  "horizontalni-zaluzie",
  "plise-zaluzie",
  "site",
  "textile-rolety",
  "universal",
];

export default async function OrderFormCreatePage({
  params,
}: {
  params: Promise<{ id: string; formType: string }>;
}) {
  const session = await getServerSession(authOptions);
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

  switch (formType) {
    case "horizontalni-zaluzie":
      return (
        <HorizontalniZaluzieFormClient
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    case "plise-zaluzie":
      return (
        <PliseZaluzieFormClient
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    case "site":
      return (
        <SiteFormClient
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    case "textile-rolety":
      return (
        <TextileRoletyFormClient
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    case "universal":
      return (
        <UniversalFormClient
          orderId={orderId}
          customerFromOrder={customerFromOrder}
        />
      );
    default:
      notFound();
  }
}
