import { NextResponse } from "next/server";
import { listSessions } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listSessions();
  return NextResponse.json(rows);
}
