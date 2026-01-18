import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { fetchFormsServer } from "@/lib/forms-server";
import FormsListClient from "./FormsListClient";

/**
 * Forms list page - Server Component
 * Fetches forms data on the server and passes to Client Component
 */
export default async function FormsListPage() {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  // Fetch forms data on server
  const result = await fetchFormsServer();

  // Handle errors
  if (!result.success) {
    return (
      <FormsListClient
        forms={[]}
        pagination={null}
        error={result.error || "Nepodařilo se načíst formuláře"}
      />
    );
  }

  // Pass data to client component
  return (
    <FormsListClient
      forms={result.data || []}
      pagination={result.pagination || null}
      error={null}
    />
  );
}
