import { NextResponse } from "next/server";
import { handleRailWebhook, webhookErrorCode } from "@livestock/payments";

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  try {
    const result = await handleRailWebhook("DWOLLA", rawBody, {
      "x-request-signature-sha-256": req.headers.get("x-request-signature-sha-256") ?? undefined,
      "x-request-signature-256": req.headers.get("x-request-signature-256") ?? undefined,
      "dwolla-signature": req.headers.get("dwolla-signature") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const code = webhookErrorCode(err);
    return NextResponse.json(
      { error: code, message: (err as Error).message },
      { status: code === "WEBHOOK_VERIFICATION_FAILED" ? 400 : 500 },
    );
  }
}
