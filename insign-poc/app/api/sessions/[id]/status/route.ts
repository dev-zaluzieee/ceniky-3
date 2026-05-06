import { NextResponse } from "next/server";
import { syncSessionStatus } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  try {
    const result = await syncSessionStatus(ctx.params.id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = POST;
