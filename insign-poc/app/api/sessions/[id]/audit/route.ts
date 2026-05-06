import { NextResponse } from "next/server";
import { getSessionById } from "@/lib/db";
import { getAuditJson } from "@/lib/insign-client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await getSessionById(ctx.params.id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  const audit = await getAuditJson(session.insign_session_id);
  return NextResponse.json(audit);
}
