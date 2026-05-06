import { buildAdmfPdf } from "@/lib/pdf-builder";

export const dynamic = "force-dynamic";

/** Lets you preview the generated demo PDF in a browser. */
export async function GET() {
  const bytes = await buildAdmfPdf();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="admf-demo.pdf"',
    },
  });
}
