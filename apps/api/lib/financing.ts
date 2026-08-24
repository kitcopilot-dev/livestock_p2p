import { prisma } from "@livestock/db";
import { TransactionManager } from "@livestock/domain";
import { scheduleFinancingDeadline } from "@livestock/jobs";
import { getPlatformSettings } from "./platformSettings";

/**
 * Financing (deferred payment) terms enforcement.
 *
 * A buyer who picks "Pay later" gets a committed escrow with a 14-day
 * (admin-tunable) window to fund it; if the deadline passes, the financing
 * job auto-cancels the escrow. Eligibility is enforced here, before and at
 * the point of financing:
 *   - per-escrow cap on sale amount
 *   - per-buyer cap on concurrent outstanding financed amount
 *   - lapse guard: 2+ missed payment deadlines in 90 days disables financing
 */

const LAPSE_WINDOW_MS = 90 * 24 * 3_600_000;
const MAX_LAPSES = 2;

export interface FinancingResult {
  ok: boolean;
  error?: string;
  escrowId?: string;
}

function dollars(n: number): string {
  return `$${(n / 100).toLocaleString("en-US")}`;
}

/**
 * Eligibility pre-check — run BEFORE an escrow is created so a failing
 * financing choice never leaves the listing marked SOLD. Returns an error
 * string, or null when the buyer qualifies.
 */
export async function assertFinancingEligible(input: {
  buyerId: string;
  saleAmountCents: number;
}): Promise<string | null> {
  const platform = await getPlatformSettings();
  const now = new Date();

  if (input.saleAmountCents > platform.financingMaxEscrowCents) {
    return `This deal (${dollars(input.saleAmountCents)}) exceeds the ${dollars(platform.financingMaxEscrowCents)} financing cap per escrow`;
  }

  const outstanding = await prisma.escrowTransaction.aggregate({
    where: { buyerId: input.buyerId, status: "PENDING_PAYMENT" },
    _sum: { saleAmountCents: true },
  });
  const outstandingCents = (outstanding._sum.saleAmountCents ?? 0) + input.saleAmountCents;
  if (outstandingCents > platform.financingMaxOutstandingCents) {
    return `Financing would push you to ${dollars(outstandingCents)} outstanding, over the ${dollars(platform.financingMaxOutstandingCents)} limit`;
  }

  const lapsed = await prisma.milestone.count({
    where: {
      escrow: { buyerId: input.buyerId },
      kind: "PAYMENT_DEADLINE_MISSED",
      occurredAt: { gte: new Date(now.getTime() - LAPSE_WINDOW_MS) },
    },
  });
  if (lapsed >= MAX_LAPSES) {
    return "Financing is disabled for this account after missed payment deadlines — contact support";
  }

  return null;
}

/**
 * Converts a DRAFT escrow into a financed (deferred-payment) escrow: re-runs
 * eligibility, stamps paymentDeadlineAt + financingFeeCents, and schedules
 * the auto-cancel job. Call only after assertFinancingEligible passed (or
 * accept the race — the same checks re-run here under the row lock).
 */
export async function financeEscrow(
  escrowId: string,
  actingUserId?: string,
): Promise<FinancingResult> {
  const escrow = await prisma.escrowTransaction.findUnique({ where: { id: escrowId } });
  if (!escrow) return { ok: false, error: "Escrow not found" };
  if (escrow.status !== "DRAFT") {
    return { ok: false, error: `Only draft escrows can be financed (current status: ${escrow.status})` };
  }

  const eligibilityError = await assertFinancingEligible({
    buyerId: escrow.buyerId,
    saleAmountCents: escrow.saleAmountCents,
  });
  if (eligibilityError) return { ok: false, error: eligibilityError };

  const platform = await getPlatformSettings();
  const paymentDeadlineAt = new Date(Date.now() + platform.financingWindowDays * 24 * 3_600_000);

  try {
    const tm = new TransactionManager();
    await tm.markPendingPayment(
      escrowId,
      { actor: "BUYER", userId: actingUserId },
      { paymentDeadlineAt, financingFeeBps: platform.financingFeeBps },
    );
    await scheduleFinancingDeadline(escrowId, paymentDeadlineAt).catch(() => undefined);
    return { ok: true, escrowId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
