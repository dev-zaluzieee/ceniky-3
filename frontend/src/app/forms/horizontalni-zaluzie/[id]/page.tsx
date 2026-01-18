import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import HorizontalniZaluzieFormClient from "../HorizontalniZaluzieFormClient";
import { fetchFormByIdServer } from "@/lib/forms-server";
import { HorizontalniZaluzieFormData } from "@/types/forms/horizontalni-zaluzie.types";

/**
 * Horizontal blinds form edit page - Server Component
 * Fetches form data and renders the Client Component in edit mode
 */
export default async function HorizontalniZaluzieFormEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // Extract form ID from params
  const { id } = await params;
  const formId = parseInt(id, 10);

  // Validate form ID
  if (isNaN(formId)) {
    notFound();
  }

  // Fetch form data from backend
  const formResponse = await fetchFormByIdServer(formId);

  // Handle errors
  if (!formResponse.success || !formResponse.data) {
    if (formResponse.error === "Form not found") {
      notFound();
    }
    // For other errors, redirect to forms list with error
    redirect("/forms/list?error=fetch_failed");
  }

  const form = formResponse.data;

  // Validate form type matches the route
  if (form.form_type !== "horizontalni-zaluzie") {
    // Form type mismatch - redirect to forms list
    redirect("/forms/list?error=invalid_form_type");
  }

  // Transform form_json to HorizontalniZaluzieFormData
  // The form_json should already match HorizontalniZaluzieFormData structure
  const initialData = form.form_json as HorizontalniZaluzieFormData;

  // Ensure rooms array exists and has proper structure
  if (!initialData.rooms) {
    initialData.rooms = [];
  }

  // Ensure all rooms have rows array
  initialData.rooms = initialData.rooms.map((room) => ({
    ...room,
    rows: room.rows || [],
  }));

  // Render client component with initial data and form ID
  return (
    <HorizontalniZaluzieFormClient
      initialData={initialData}
      formId={formId}
    />
  );
}
