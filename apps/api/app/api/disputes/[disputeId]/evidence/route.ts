import { NextResponse } from "next/server";
import { DomainError } from "@livestock/shared";
import { addEvidence, addEvidenceSchema } from "@livestock/domain";
import { requireUser } from "../../../../../lib/auth";

/**
 * Evidence upload. The client uploads the file to object storage and posts
 * the metadata (storageUri + client-computed SHA-256). The hash is re-verified
 * against storage before adjudication (compliance/mediaHash).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ disputeId: string }> },
): Promise<NextResponse> {
  try {
    const user = requireUser(req);
    const { disputeId } = await ctx.params;
    const body = addEvidenceSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: body.error.issues },
        { status: 400 },
      );
    }
    const evidence = await addEvidence({
      ...body.data,
      disputeId,
      uploaderId: user.userId,
    });
    return NextResponse.json({ evidence }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
