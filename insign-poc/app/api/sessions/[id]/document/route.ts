import { NextRequest, NextResponse } from "next/server";
import { getSessionById, getSignedDocumentById, listSignedDocuments, storeSignedDocument } from "@/lib/db";
import { downloadDocuments } from "@/lib/insign-client";

export const dynamic = "force-dynamic";

/**
 * RFC 6266 / 5987: HTTP headers must be ASCII. For filenames with non-ASCII
 * characters (Czech diacritics, em-dash, …) we send both an ASCII-stripped
 * `filename=` for legacy clients and a percent-encoded `filename*=` per RFC 5987.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_") || "download";
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${ascii.replace(/"/g, "")}"; filename*=UTF-8''${utf8}`;
}

/**
 * GET /api/sessions/:id/document            -> latest stored archive (lazy-fetch from inSign if absent)
 * GET /api/sessions/:id/document?artifact=ID -> specific stored artifact by id
 * GET /api/sessions/:id/document?refresh=1   -> force a fresh download from inSign
 */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    return await handle(req, ctx);
  } catch (e) {
    console.error(`[/api/sessions/${ctx.params.id}/document] unhandled`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

async function handle(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getSessionById(ctx.params.id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const artifactId = url.searchParams.get("artifact");
  const refresh = url.searchParams.get("refresh") === "1";

  if (artifactId) {
    const doc = await getSignedDocumentById(artifactId);
    if (!doc || doc.session_id !== session.id) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return new Response(new Uint8Array(doc.data), {
      headers: {
        "Content-Type": doc.content_type,
        "Content-Disposition": contentDisposition(doc.filename),
      },
    });
  }

  let docs = await listSignedDocuments(session.id);
  let archive = docs.find((d) => d.kind === "archive_zip" || d.kind === "document");

  if (!archive || refresh) {
    const dl = await downloadDocuments(session.insign_session_id, { auditreport: true, incBioData: true });
    const kind = dl.contentType.includes("zip") ? "archive_zip" : "document";
    await storeSignedDocument({
      sessionId: session.id,
      kind,
      filename: dl.filename,
      contentType: dl.contentType,
      data: dl.bytes,
    });
    docs = await listSignedDocuments(session.id);
    archive = docs.find((d) => d.kind === "archive_zip" || d.kind === "document");
  }

  if (!archive) return NextResponse.json({ error: "no document available" }, { status: 404 });

  const doc = await getSignedDocumentById(archive.id);
  if (!doc) return NextResponse.json({ error: "stored row vanished" }, { status: 500 });

  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": contentDisposition(doc.filename),
    },
  });
}
