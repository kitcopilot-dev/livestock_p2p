import { NextResponse } from "next/server";
import { handleRailWebhook, webhookErrorCode } from "@livestock/payments";

export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  try {
    const result = await handleRailWebhook("STRIPE", rawBody, {
      "stripe-signature": req.headers.get("stripe-signature") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const code = webhookErrorCode(err);
    // Signature failures are NOT retried by Stripe; other failures return 500
    // so Stripe retries the delivery.
    return NextResponse.json(
      { error: code, message: (err as Error).message },
      { status: code === "WEBHOOK_VERIFICATION_FAILED" ? 400 : 500 },
    );
  }
}
