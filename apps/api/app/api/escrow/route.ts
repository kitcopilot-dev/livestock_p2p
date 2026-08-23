import { NextResponse } from "next/server";
import { DomainError } from "@livestock/shared";
import { TransactionManager, createDraftSchema } from "@livestock/domain";
import { requireUser } from "../../../lib/auth";

export async function POST(req: Request): Promise<NextResponse> {
  let authContext;
  try {
    authContext = requireUser(req);
    void authContext;

    const body = createDraftSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: body.error.issues },
        { status: 400 },
      );
    }

    const tm = new TransactionManager();
    const escrow = await tm.createDraft(body.data);
    return NextResponse.json({ escrow }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
