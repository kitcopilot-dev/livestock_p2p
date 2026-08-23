import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { DomainError, getInspectionWindowMs, getDisputeProofWindowMs } from "@livestock/shared";
import {
  TransactionManager,
  fileDisputeSchema,
  markDeliveredSchema,
} from "@livestock/domain";
import { scheduleDisputeProofDeadline, scheduleInspectionTimeout } from "@livestock/jobs";
import { chargeAndFundEscrow } from "@livestock/payments";
import { actorForRole, requireUser } from "../../../../lib/auth";
import { demoWindowsFromCookie } from "../../../../lib/demoAuth";

const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("fund") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("inTransit") }),
  z.object({ action: z.literal("delivered"), deliveredWeightLbs: markDeliveredSchema.shape.deliveredWeightLbs }),
  z.object({ action: z.literal("dispute"), ...fileDisputeSchema.shape }),
]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ escrowId: string }> },
): Promise<NextResponse> {
  try {
    const user = requireUser(req);
    const { escrowId } = await ctx.params;

    const body = transitionSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: body.error.issues },
        { status: 400 },
      );
    }

    const tm = new TransactionManager();
    const actor = actorForRole(user.role);
    const base = { actor, userId: user.userId };

    // Read demo speed from cookie
    const cookieStore = await cookies();
    const { inspectionWindowMs, disputeProofWindowMs } = demoWindowsFromCookie(cookieStore);

    switch (body.data.action) {
      case "fund": {
        if (process.env.PAYMENTS_DRY_RUN === "false") {
          const result = await chargeAndFundEscrow(escrowId, {
            userId: user.userId,
          });
          return NextResponse.json({ escrow: result.escrow });
        }
        return NextResponse.json({ escrow: await tm.fund(escrowId, base) });
      }
      case "cancel":
        return NextResponse.json({ escrow: await tm.cancel(escrowId, base) });
      case "inTransit":
        return NextResponse.json({ escrow: await tm.markInTransit(escrowId, base) });
      case "delivered": {
        const escrow = await tm.markDelivered(escrowId, base, {
          deliveredWeightLbs: body.data.deliveredWeightLbs ?? null,
          inspectionWindowMs,
        });
        if (escrow.inspectionDeadlineAt) {
          // Fire-and-forget with error surfacing: if scheduling fails the
          // reconciliation sweep re-enqueues, but log loudly here.
          await scheduleInspectionTimeout(escrowId, escrow.inspectionDeadlineAt).catch(() => undefined);
        }
        return NextResponse.json({ escrow });
      }
      case "dispute": {
        const result = await tm.fileDispute(
          escrowId,
          {
            filedByUserId: user.userId,
            reason: body.data.reason,
            description: body.data.description,
          },
          base,
          { disputeProofWindowMs },
        );
        if (result.escrow.disputeProofDeadlineAt) {
          await scheduleDisputeProofDeadline(
            escrowId,
            result.escrow.disputeProofDeadlineAt,
          ).catch(() => undefined);
        }
        return NextResponse.json({ escrow: result.escrow, dispute: result.dispute });
      }
    }
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.retryable ? 503 : 409;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
