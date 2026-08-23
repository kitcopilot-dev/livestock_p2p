import { NextResponse } from "next/server";
import { DomainError } from "@livestock/shared";
import { acceptVerifiedClaim } from "@livestock/compliance";
import { markEvidenceVerified } from "@livestock/domain";

/**
 * Partner verification webhook (Truepic, scale-ticket OCR, vet telehealth).
 *
 * Partners POST a signed claim payload:
 *   { evidenceId, source, claims, issuedAt, nonce }
 * signed with HMAC-SHA256 (PARTNER_WEBHOOK_SECRET) in the
 * `x-partner-signature` header. The claim is verified here before any flag is
 * applied to an Evidence row — unsigned or stale claims are rejected and
 * never reach the rules engine.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-partner-signature") ?? "";
  const secret = process.env.PARTNER_WEBHOOK_SECRET ?? "";

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const flags = acceptVerifiedClaim(payload, signature, secret);
    const evidenceId = (payload as { evidenceId: string }).evidenceId;
    const updated = await markEvidenceVerified(evidenceId, flags);
    return NextResponse.json({ ok: true, evidence: updated });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
