import { NextResponse } from "next/server";
import { getSessionById, listSignedDocuments } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await getSessionById(ctx.params.id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  const documents = await listSignedDocuments(session.id);
  return NextResponse.json({ session, documents });
}
