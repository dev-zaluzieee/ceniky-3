import { NextRequest, NextResponse } from "next/server";
import { getSessionById, updateSessionStatus } from "@/lib/db";
import { rejectSession } from "@/lib/insign-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionById(ctx.params.id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const gdprDeclined = url.searchParams.get("gdpr") === "1";

  await rejectSession(session.insign_session_id, { gdprDeclined });
  await updateSessionStatus(session.id, {
    status: "rejected",
    rejected: true,
    gdprDeclined,
    rejectedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
