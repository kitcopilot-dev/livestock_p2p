import { NextResponse } from "next/server";
import { DomainError } from "@livestock/shared";
import { resolveArbitration, resolveArbitrationSchema } from "@livestock/domain";
import { requireUser } from "../../../../lib/auth";

/**
 * Arbitration resolution endpoint (platform / arbiter only). Computes the
 * deterministic settlement vector and records the verdict; the settlement
 * executor (settlement-retry worker or an immediate call) then disburses.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ disputeId: string }> },
): Promise<NextResponse> {
  try {
    const user = requireUser(req);
    if (user.role !== "PLATFORM") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const { disputeId } = await ctx.params;
    const body = resolveArbitrationSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const result = await resolveArbitration(disputeId, {
      verdict: body.data.verdict,
      actor: "SYSTEM_ARBITER",
      userId: user.userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
