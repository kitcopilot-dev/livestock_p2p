"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DomainError } from "@livestock/shared";
import {
  addEvidence,
  createDraftSchema,
  fileDisputeSchema,
  resolveArbitration,
  resolveArbitrationSchema,
  TransactionManager,
  type DisputeVerdict,
} from "@livestock/domain";
import { scheduleDisputeProofDeadline, scheduleInspectionTimeout } from "@livestock/jobs";
import { processEscrowSettlement } from "@livestock/payments";
import { getDemoUser, demoWindowsFromCookie, actorForDemoRole } from "../../lib/demoAuth";
import { isDemoMode } from "../../lib/auth";
import { getPlatformSettings } from "../../lib/platformSettings";
import { financeEscrow } from "../../lib/financing";

export interface ActionResult {
  ok: boolean;
  error?: string;
  escrowId?: string;
}

function dollarsToCents(dollars: string | null): number | null {
  if (!dollars) return null;
  const parsed = Number.parseFloat(dollars);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function errorResult(err: unknown): ActionResult {
  if (err instanceof DomainError) {
    return { ok: false, error: `${err.code}: ${err.message}` };
  }
  return { ok: false, error: (err as Error).message };
}

export async function createEscrowAction(formData: FormData): Promise<ActionResult | void> {
  try {
    const acting = await getDemoUser();
    const saleAmountCents = dollarsToCents(formData.get("saleAmount")?.toString() ?? null);
    const freightFeeCents = dollarsToCents(formData.get("freightFee")?.toString() ?? null);
    if (saleAmountCents === null || freightFeeCents === null) {
      return { ok: false, error: "saleAmount and freightFee must be valid dollar amounts" };
    }
    const parsed = createDraftSchema.safeParse({
      buyerId: formData.get("buyerId")?.toString() ?? "",
      sellerId: formData.get("sellerId")?.toString() ?? "",
      haulerId: formData.get("haulerId")?.toString() ?? "",
      saleAmountCents,
      contractedWeightLbs: Number(formData.get("contractedWeightLbs")),
      weightTolerancePct: Number(formData.get("weightTolerancePct") ?? 2),
      freightFeeCents,
      platformFeeBps: Number(formData.get("platformFeeBps") ?? 250),
    });
    if (!parsed.success) {
      return { ok: false, error: `validation failed: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` };
    }
    const tm = new TransactionManager();
    const escrow = await tm.createDraft(parsed.data);
    void acting;
    revalidatePath("/escrows");
    redirect(`/escrows/${escrow.id}`);
  } catch (err) {
    // redirect() throws NEXT_REDIRECT — let it propagate.
    if (err instanceof Error && "digest" in err && (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return errorResult(err);
  }
}

export async function advanceEscrowAction(
  escrowId: string,
  step: "fund" | "inTransit" | "delivered",
  deliveredWeightLbs?: number | null,
): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const cookieStore = await cookies();
    const { inspectionWindowMs, disputeProofWindowMs } = isDemoMode()
      ? demoWindowsFromCookie(cookieStore)
      : await getPlatformSettings();
    const tm = new TransactionManager();
    const actor = actorForDemoRole(user.role);
    const base = { actor, userId: user.id };
    let escrow;
    if (step === "fund") {
      // Manual funding: ledger-only fund via the transaction manager.
      // Actual payment collection happens separately through the rail
      // (e.g. buyer's Stripe/Dwolla source is charged on fund). For now,
      // funding is an explicit admin/buyer action without auto-charging.
      escrow = await tm.fund(escrowId, base);
    } else if (step === "inTransit") {
      escrow = await tm.markInTransit(escrowId, base);
    } else {
      escrow = await tm.markDelivered(escrowId, base, { deliveredWeightLbs: deliveredWeightLbs ?? null, inspectionWindowMs });
      if (escrow.inspectionDeadlineAt) {
        await scheduleInspectionTimeout(escrowId, escrow.inspectionDeadlineAt).catch(() => undefined);
      }
    }
    revalidatePath("/escrows");
    revalidatePath(`/escrows/${escrowId}`);
    return { ok: true, escrowId };
  } catch (err) {
    return errorResult(err);
  }
}

export async function cancelEscrowAction(escrowId: string): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const escrow = await new TransactionManager().cancel(escrowId, { actor: actorForDemoRole(user.role), userId: user.id });
    void escrow;
    revalidatePath("/escrows");
    revalidatePath(`/escrows/${escrowId}`);
    return { ok: true, escrowId };
  } catch (err) {
    return errorResult(err);
  }
}

export async function fileDisputeAction(escrowId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const parsed = fileDisputeSchema.safeParse({
      reason: formData.get("reason")?.toString(),
      description: formData.get("description")?.toString() || undefined,
    });
    if (!parsed.success) return { ok: false, error: "validation failed" };
    const cookieStore = await cookies();
    const { disputeProofWindowMs } = demoWindowsFromCookie(cookieStore);
    const tm = new TransactionManager();
    const result = await tm.fileDispute(escrowId, { filedByUserId: user.id, ...parsed.data }, { actor: "BUYER", userId: user.id }, { disputeProofWindowMs });
    if (result.escrow.disputeProofDeadlineAt) {
      await scheduleDisputeProofDeadline(escrowId, result.escrow.disputeProofDeadlineAt).catch(() => undefined);
    }
    revalidatePath("/escrows");
    revalidatePath(`/escrows/${escrowId}`);
    return { ok: true, escrowId };
  } catch (err) {
    return errorResult(err);
  }
}

export async function resolveDisputeAction(disputeId: string, verdict: DisputeVerdict): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const parsed = resolveArbitrationSchema.safeParse({ verdict });
    if (!parsed.success) return { ok: false, error: "invalid verdict" };
    const result = await resolveArbitration(disputeId, { verdict: parsed.data.verdict, actor: "SYSTEM_ARBITER", userId: user.id });
    // Recorded the verdict; now execute the split payout (dry-run provider in
    // local dev, real rails in production). On failure the verdict stands and
    // the settlement-retry worker / sweep picks the payout back up.
    try {
      await processEscrowSettlement(result.dispute.escrowId, {
        actor: "SYSTEM_ARBITER",
        vector: result.vector,
        userId: user.id,
      });
    } catch (settleErr) {
      console.warn("verdict recorded; payout pending retry", settleErr);
    }
    revalidatePath("/disputes");
    revalidatePath(`/escrows/${result.dispute.escrowId}`);
    return { ok: true, escrowId: result.dispute.escrowId };
  } catch (err) {
    return errorResult(err);
  }
}

export async function addEvidenceAction(formData: FormData): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const evidence = await addEvidence({
      disputeId: formData.get("disputeId")?.toString() ?? "",
      escrowId: formData.get("escrowId")?.toString() ?? "",
      uploaderId: user.id,
      source: (formData.get("source")?.toString() ?? "UPLOAD") as "UPLOAD",
      fileType: (formData.get("fileType")?.toString() ?? "IMAGE") as "IMAGE",
      storageUri: formData.get("storageUri")?.toString() ?? "",
      fileSha256: formData.get("fileSha256")?.toString() ?? "",
      metadata: { fileName: formData.get("fileName")?.toString() ?? null },
    });
    revalidatePath(`/escrows/${evidence.escrowId}`);
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

/**
 * Create an escrow with deferred payment (financing option).
 * The escrow goes to PENDING_PAYMENT instead of DRAFT, allowing the
 * buyer to pay later from the escrow detail page.
 */
export async function createFinancedEscrowAction(
  escrowId: string,
): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const res = await financeEscrow(escrowId, user.id);
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath("/escrows");
    revalidatePath(`/escrows/${escrowId}`);
    return { ok: true, escrowId };
  } catch (err) {
    return errorResult(err);
  }
}

/**
 * Fund an escrow that was created with deferred payment.
 * Moves from PENDING_PAYMENT -> FUNDED.
 */
export async function fundEscrowLaterAction(
  escrowId: string,
): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const tm = new TransactionManager();
    const actor = actorForDemoRole(user.role);
    await tm.fund(escrowId, { actor, userId: user.id });
    revalidatePath("/escrows");
    revalidatePath(`/escrows/${escrowId}`);
    return { ok: true, escrowId };
  } catch (err) {
    return errorResult(err);
  }
}

/** Escalate an open dispute to formal arbitration (platform role). */
export async function escalateDisputeAction(disputeId: string): Promise<ActionResult> {
  try {
    const user = await getDemoUser();
    const tm = new TransactionManager();
    const escrow = await tm.submitForArbitration(disputeId, { actor: "SYSTEM_ARBITER", userId: user.id });
    revalidatePath("/disputes");
    revalidatePath(`/escrows/${escrow.id}`);
    return { ok: true, escrowId: escrow.id };
  } catch (err) {
    return errorResult(err);
  }
}
