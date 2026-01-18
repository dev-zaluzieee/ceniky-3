import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import SiteFormClient from "./SiteFormClient";

/**
 * Window/door screens form page - Server Component
 * Minimal wrapper that checks authentication and renders the Client Component
 */
export default async function SiteFormPage() {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // Render client component (form starts empty, no initial data needed)
  return <SiteFormClient />;
}
