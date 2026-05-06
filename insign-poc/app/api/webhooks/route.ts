import { NextResponse } from "next/server";
import { listWebhookEvents } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listWebhookEvents();
  return NextResponse.json(rows);
}
