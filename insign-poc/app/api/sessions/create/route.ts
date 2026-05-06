import { NextRequest, NextResponse } from "next/server";
import { buildAdmfPdf, bytesToBase64, SIG_MARKER_CUSTOMER, SIG_MARKER_MEDIATOR, DEMO_ADMF_DATA } from "@/lib/pdf-builder";
import { configureSession, startExternMultiuser } from "@/lib/insign-client";
import { env } from "@/lib/env";
import { insertSession, updateSessionExternLinks, type DeliveryMode } from "@/lib/db";

export const dynamic = "force-dynamic";

interface Body {
  deliveryMode: DeliveryMode;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  mediatorName?: string;
  mediatorEmail?: string;
  inOrder?: boolean;
  smsOnly?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[/api/sessions/create] unhandled", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack?.split("\n").slice(0, 8) : undefined,
      },
      { status: 500 }
    );
  }
}

async function handle(req: NextRequest) {
  const body = (await req.json()) as Body;
  const customerName = body.customerName?.trim() || DEMO_ADMF_DATA.jmenoPrijmeni;
  const mediatorName = body.mediatorName?.trim() || "Karel Křesťan";
  const customerEmail = body.customerEmail?.trim() || env.defaults.recipientEmail();
  const mediatorEmail = body.mediatorEmail?.trim() || env.defaults.recipientEmail();
  const customerPhone = body.customerPhone?.trim() || null;
  const deliveryMode = body.deliveryMode === "extern" ? "extern" : "inapp";

  const pdfBytes = await buildAdmfPdf({
    ...DEMO_ADMF_DATA,
    jmenoPrijmeni: customerName,
  });
  const pdfBase64 = bytesToBase64(pdfBytes);
  const docId = `admf-${Date.now()}`;
  const displayname = `ADMF — ${customerName}`;

  const webhookUrl = `${env.webhook.baseUrl()}/api/insign/webhook`;
  const browserCallback = `${env.browser.callbackBaseUrl()}/sessions/return`;

  const created = await configureSession({
    displayname,
    foruser: env.insign.foruser(),
    callbackURL: browserCallback,
    serverSidecallbackURL: webhookUrl,
    serversideCallbackMethod: "POST",
    serversideCallbackContenttype: "json",
    serversideCallbackUsername: env.webhook.username() || undefined,
    serversideCallbackPassword: env.webhook.password() || undefined,
    documents: [
      {
        id: docId,
        displayname,
        file: pdfBase64,
        signatures: [
          {
            id: "sig-customer",
            role: "customer",
            displayname: "Podpis zákazníka",
            required: true,
            signatureLevel: "SES",
            textsearch: SIG_MARKER_CUSTOMER,
            posindex: 1,
          },
          {
            id: "sig-mediator",
            role: "mediator",
            displayname: "Podpis zprostředkovatele",
            required: true,
            signatureLevel: "SES",
            textsearch: SIG_MARKER_MEDIATOR,
            posindex: 2,
          },
        ],
      },
    ],
  });

  if (!created.sessionid) {
    return NextResponse.json(
      { error: created.message ?? "configure/session returned no sessionid", raw: created },
      { status: 502 }
    );
  }

  const session = await insertSession({
    insignSessionId: created.sessionid,
    displayname,
    foruser: env.insign.foruser(),
    customerName,
    customerEmail,
    customerPhone,
    mediatorName,
    mediatorEmail,
    deliveryMode,
    accessUrl: created.accessURL ?? null,
  });

  if (deliveryMode === "extern") {
    const externResult = await startExternMultiuser(
      {
        sessionid: created.sessionid,
        inOrder: body.inOrder ?? true,
        externUsers: [
          {
            recipient: customerEmail,
            recipientsms: customerPhone || undefined,
            roles: ["customer"],
            sendEmails: !body.smsOnly,
            sendSMS: !!customerPhone,
            smsonly: !!body.smsOnly,
            mailLanguage: "cs",
            userType: "signatory",
            orderNumber: 1,
          },
          {
            recipient: mediatorEmail,
            roles: ["mediator"],
            sendEmails: true,
            sendSMS: false,
            smsonly: false,
            mailLanguage: "cs",
            userType: "signatory",
            orderNumber: 2,
          },
        ],
      },
      { skipLandingPage: false }
    );
    await updateSessionExternLinks(session.id, externResult);
  }

  return NextResponse.json({ id: session.id, insignSessionId: created.sessionid, accessURL: created.accessURL });
}
