import { randomUUID } from "node:crypto";
import { Prisma, prisma, type EscrowTransaction, type PaymentIntent } from "@livestock/db";
import {
  assertPreSettlementEligible,
  assertVectorZeroSum,
  computeSettlementBreakdown,
  ensureLedgerAccount,
  type EscrowActor,
  type SettlementVector,
  TransactionManager,
  ValidationError,
  type LedgerAccountRef,
} from "@livestock/domain";
import { runEscrowTransaction } from "@livestock/domain";
import { cents, DomainError, MAX_SETTLEMENT_ATTEMPTS } from "@livestock/shared";
import { PaymentProviderError } from "./provider";
import type { ChargeResult, PaymentProvider, RailName } from "./provider";
import { DryRunProvider } from "./dryRunProvider";
import { DwollaProvider } from "./dwollaProvider";
import { StripeProvider } from "./stripeProvider";

/**
 * processEscrowSettlement — the multi-party split payout.
 *
 * Two-phase protocol (the only way money leaves the escrow):
 *
 *   PHASE A (single tx, SERIALIZABLE):
 *     lock escrow FOR UPDATE, pre-flight guard (deadline passed, no open
 *     dispute, no prior release), compute the settlement vector, and create
 *     PaymentIntent rows + PENDING ledger entries. Re-entry safe: existing
 *     intents are reused, so a retried/double job never duplicates.
 *
 *   PHASE B (per intent, idempotent):
 *     check intent status, call the rail with Idempotency-Key = the intent id,
 *     flip intent + ledger entry to SUCCEEDED/COMMITTED. Transient provider
 *     errors bubble up so the queue retries with backoff; permanent failures
 *     mark the intent FAILED and raise for escalation (DLQ -> ops).
 *
 *   PHASE C (single tx):
 *     all legs succeeded -> TransactionManager.markSettled() flips the escrow
 *     to RESOLVED_DISBURSED under the row lock (full guard set re-run).
 */

export interface SettlementContext {
  actor: EscrowActor;
  userId?: string;
  /** Required for the ARBITRATION_PROCESSING path; ignored for auto-release. */
  vector?: SettlementVector;
}

export interface SettlementResult {
  escrow: EscrowTransaction;
  intents: PaymentIntent[];
  vector: SettlementVector;
  rail: RailName;
}

export class SettlementFailedError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("SETTLEMENT_FAILED", message, { retryable: false, details });
  }
}

/**
 * The 24h auto-release entry point used by the inspection-timeout worker and
 * the reconciliation sweep. Guards run under the escrow row lock, so if the
 * buyer filed a dispute at the same instant, the winner is deterministic and
 * this call throws IllegalTransitionError (the worker treats it as a no-op).
 */
export async function autoReleaseFunds(
  escrowId: string,
  deps?: { providers?: Partial<Record<RailName, PaymentProvider>>; transactionManager?: TransactionManager },
): Promise<SettlementResult> {
  return processEscrowSettlement(escrowId, { actor: "SYSTEM_TIMER" }, deps);
}

export async function processEscrowSettlement(
  escrowId: string,
  ctx: SettlementContext,
  deps: { providers?: Partial<Record<RailName, PaymentProvider>>; transactionManager?: TransactionManager } = {},
): Promise<SettlementResult> {
  const tm = deps.transactionManager ?? new TransactionManager();

  // ---- PHASE A ---------------------------------------------------------------
  const prepared = await runEscrowTransaction(
    async (tx) => {
      const rows = await tx.$queryRaw<EscrowTransaction[]>`
        SELECT * FROM "EscrowTransaction" WHERE id = ${escrowId} FOR UPDATE`;
      const escrow = rows[0];
      if (!escrow) {
        throw new ValidationError(`escrow ${escrowId} not found`);
      }

      const dispute =
        escrow.status === "ARBITRATION_PROCESSING"
          ? await tx.automatedDispute.findFirst({ where: { escrowId }, orderBy: { filedAt: "desc" } })
          : null;
      const releasedExists = !!(await tx.milestone.findFirst({
        where: { escrowId, kind: "RELEASED" },
      }));

      assertPreSettlementEligible({
        escrow,
        actor: ctx.actor,
        now: new Date(),
        meta: { dispute, releasedMilestoneExists: releasedExists },
      });

      const settlementInput = {
        saleAmountCents: escrow.saleAmountCents,
        contractedWeightLbs: escrow.contractedWeightLbs,
        deliveredWeightLbs: escrow.deliveredWeightLbs,
        weightTolerancePct: escrow.weightTolerancePct,
        pricePerLbMicros: escrow.pricePerLbMicros,
        freightFeeCents: escrow.freightFeeCents,
        platformFeeBps: escrow.platformFeeBps,
      };
      const breakdown =
        escrow.status === "INSPECTION_PERIOD"
          ? computeSettlementBreakdown(settlementInput)
          : undefined;
      const vector = ctx.vector ?? (breakdown ? breakdownToVector(breakdown) : undefined);
      if (!vector) {
        throw new ValidationError("settlement vector required for arbitration path");
      }
      assertVectorZeroSum(vector, cents(escrow.saleAmountCents));

      // Re-entry safety: reuse any existing transfer intents for this escrow.
      const existingIntents = await tx.paymentIntent.findMany({
        where: { escrowId, railOperation: "TRANSFER" },
      });
      if (existingIntents.length > 0) {
        const rail = await selectRailForEscrow(tx, escrow);
        return {
          escrow,
          vector,
          intents: existingIntents,
          shrinkPenaltyCents: escrow.shrinkPenaltyCents ?? 0,
          rail,
        };
      }
      const shrinkPenaltyCents = breakdown?.shrinkPenaltyCents ?? 0;

      const escrowAccount = await ensureLedgerAccount(tx, { accountType: "PLATFORM_ESCROW" });
      const revenueAccount = await ensureLedgerAccount(tx, { accountType: "PLATFORM_REVENUE" });
      const sellerWallet = await ensureLedgerAccount(tx, { accountType: "USER_WALLET", ownerUserId: escrow.sellerId });
      const haulerWallet = await ensureLedgerAccount(tx, { accountType: "USER_WALLET", ownerUserId: escrow.haulerId });
      const buyerWallet = await ensureLedgerAccount(tx, { accountType: "USER_WALLET", ownerUserId: escrow.buyerId });

      const rail = await selectRailForEscrow(tx, escrow);
      // Rail legs move money to external destinations (seller, hauler, buyer
      // refund). Each gets a PENDING PaymentIntent + PENDING ledger entry and
      // is executed against the rail in Phase B.
      const railLegs: Array<{
        leg: { debitAccountId: string; creditAccountId: string; amountCents: number };
        destinationAccountRef: string;
      }> = [
        { leg: { debitAccountId: escrowAccount.id, creditAccountId: sellerWallet.id, amountCents: vector.sellerPayoutCents }, destinationAccountRef: sellerWallet.externalAccountRef ?? "" },
        { leg: { debitAccountId: escrowAccount.id, creditAccountId: haulerWallet.id, amountCents: vector.haulerPayoutCents }, destinationAccountRef: haulerWallet.externalAccountRef ?? "" },
      ];
      if (vector.buyerRefundCents > 0) {
        railLegs.push({
          leg: { debitAccountId: escrowAccount.id, creditAccountId: buyerWallet.id, amountCents: vector.buyerRefundCents },
          destinationAccountRef: buyerWallet.externalAccountRef ?? "",
        });
      }

      // Internal legs (platform fee revenue) move money between platform
      // accounts — they never cross the rail, so they post straight to the
      // ledger as COMMITTED and are not part of the intent set.
      const internalLegs: Array<{
        leg: { debitAccountId: string; creditAccountId: string; amountCents: number };
        idempotencyKey: string;
        description: string;
      }> = [];
      if (vector.platformFeeCents > 0) {
        internalLegs.push({
          leg: { debitAccountId: escrowAccount.id, creditAccountId: revenueAccount.id, amountCents: vector.platformFeeCents },
          idempotencyKey: `settle:${escrowId}:revenue`,
          description: `Platform fee for ${escrow.reference}`,
        });
      }

      const intents: PaymentIntent[] = [];
      for (const { leg, destinationAccountRef } of railLegs) {
        const id = `pi_${randomUUID()}`;
        const intent = await tx.paymentIntent.create({
          data: {
            id,
            escrowId,
            rail,
            railOperation: "TRANSFER",
            status: "PENDING",
            idempotencyKey: `settle:${id}`,
            amountCents: leg.amountCents,
            currency: escrow.currency,
            destinationAccountRef: destinationAccountRef || null,
            sourceAccountRef: escrowAccount.externalAccountRef,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            debitAccountId: leg.debitAccountId,
            creditAccountId: leg.creditAccountId,
            amountCents: leg.amountCents,
            currency: escrow.currency,
            entryType: "SETTLEMENT",
            status: "PENDING",
            transactionId: escrowId,
            idempotencyKey: `settle:${id}`,
            description: `Settlement leg for ${escrow.reference}`,
            committedAt: null,
          },
        });
        intents.push(intent);
      }
      for (const { leg, idempotencyKey, description } of internalLegs) {
        await tx.ledgerEntry.create({
          data: {
            debitAccountId: leg.debitAccountId,
            creditAccountId: leg.creditAccountId,
            amountCents: leg.amountCents,
            currency: escrow.currency,
            entryType: "SETTLEMENT",
            status: "COMMITTED",
            transactionId: escrowId,
            idempotencyKey,
            description,
            committedAt: new Date(),
          },
        });
      }
      return { escrow, vector, intents, shrinkPenaltyCents, rail };
    },
  );

  const provider = getProvider(prepared.rail, deps.providers);

  // ---- PHASE B ---------------------------------------------------------------
  for (const intent of prepared.intents) {
    await executeTransfer(intent, provider);
  }

  // ---- PHASE C ---------------------------------------------------------------
  const settled = await tm.markSettled(escrowId, {
    actor: ctx.actor,
    vector: prepared.vector,
    platformFeeCents: cents(prepared.vector.platformFeeCents),
    shrinkPenaltyCents: cents(prepared.shrinkPenaltyCents),
    userId: ctx.userId,
  });

  // The escrow is settled — stamp the linked transport load as paid so the
  // load-board receipt reflects the hauler payout the moment it disburses.
  await prisma.load.updateMany({
    where: { escrowId },
    data: { paidAt: settled.settlementAt ?? new Date() },
  });

  return { escrow: settled, intents: prepared.intents, vector: prepared.vector, rail: prepared.rail };
}

export interface ChargeEscrowResult {
  escrow: EscrowTransaction;
  intent: PaymentIntent;
  rail: RailName;
  /** "PENDING" when the rail accepted the charge asynchronously (Dwolla ACH). */
  status: "SUCCEEDED" | "PENDING";
  railReferenceId: string;
}

/**
 * Charges the buyer's funding source on the configured rail and moves the
 * escrow DRAFT -> FUNDED. This is the real-money counterpart to the demo's
 * ledger-only tm.fund() — used by the rail smoke test and any UI flow that
 * funds from a stored payment method. Idempotent: an existing CHARGE intent
 * for the escrow is reused, and the rail call carries the intent's
 * Idempotency-Key, so a retried call can never double-charge.
 *
 * Production funding is webhook-driven (charge.succeeded -> tm.fund); this
 * helper applies the fund synchronously so test harnesses do not depend on
 * webhook forwarding. handleRailWebhook treats "already funded" as a no-op.
 */
export async function chargeAndFundEscrow(
  escrowId: string,
  opts: { sourceRef?: string; userId?: string } = {},
  deps: { providers?: Partial<Record<RailName, PaymentProvider>> } = {},
): Promise<ChargeEscrowResult> {
  const prepared = await runEscrowTransaction(async (tx) => {
    const escrow = await tx.escrowTransaction.findUnique({ where: { id: escrowId } });
    if (!escrow) throw new ValidationError(`escrow ${escrowId} not found`);
    if (escrow.status !== "DRAFT") {
      throw new ValidationError(`escrow ${escrowId} cannot be charged from status ${escrow.status}`);
    }
    const rail = await selectRailForEscrow(tx, escrow);
    const buyerWallet = await ensureLedgerAccount(tx, {
      accountType: "USER_WALLET",
      ownerUserId: escrow.buyerId,
    });
    const existing = await tx.paymentIntent.findFirst({ where: { escrowId, railOperation: "CHARGE" } });
    if (existing) {
      return { escrow, rail, intent: existing, sourceRef: existing.sourceAccountRef ?? "" };
    }
    const sourceRef = opts.sourceRef ?? buyerWallet.externalAccountRef ?? "";
    if (!sourceRef) {
      throw new ValidationError(`buyer payment source not configured for escrow ${escrowId}`);
    }
    const id = `pi_${randomUUID()}`;
    const intent = await tx.paymentIntent.create({
      data: {
        id,
        escrowId,
        rail,
        railOperation: "CHARGE",
        status: "PENDING",
        idempotencyKey: `charge:${escrowId}`,
        amountCents: escrow.saleAmountCents,
        currency: escrow.currency,
        sourceAccountRef: sourceRef,
      },
    });
    return { escrow, rail, intent, sourceRef };
  });

  const provider = getProvider(prepared.rail, deps.providers);

  let result: ChargeResult;
  if (prepared.intent.status === "SUCCEEDED" && prepared.intent.railReferenceId) {
    // A previous attempt already charged and recorded the rail reference.
    result = { status: "SUCCEEDED", railReferenceId: prepared.intent.railReferenceId };
  } else {
    try {
      result = await provider.chargeAndHold({
        sourceAccountRef: prepared.sourceRef,
        amountCents: prepared.intent.amountCents,
        currency: prepared.intent.currency,
        idempotencyKey: prepared.intent.idempotencyKey,
        metadata: { escrowId, paymentIntentId: prepared.intent.id },
      });
    } catch (err) {
      if (err instanceof PaymentProviderError) {
        await prisma.paymentIntent.update({
          where: { id: prepared.intent.id },
          data: {
            status: "FAILED",
            errorCode: "RAIL_REJECTED",
            errorMessage: err.message,
            attemptNumber: { increment: 1 },
          },
        });
      }
      throw err;
    }
    await prisma.paymentIntent.update({
      where: { id: prepared.intent.id },
      data: { status: "SUCCEEDED", railReferenceId: result.railReferenceId },
    });
  }

  // Funds are now captured on the rail (or accepted as PENDING ACH). Apply the
  // DRAFT -> FUNDED transition synchronously so the harness needs no webhook
  // forwarding; production funding stays webhook-driven.
  const tm = new TransactionManager();
  const escrow = await tm.fund(escrowId, { actor: "BUYER", userId: opts.userId });
  const intent = await prisma.paymentIntent.findUnique({ where: { id: prepared.intent.id } });
  if (!intent) throw new ValidationError(`payment intent ${prepared.intent.id} disappeared`);
  return {
    escrow,
    intent,
    rail: prepared.rail,
    status: result.status,
    railReferenceId: result.railReferenceId,
  };
}

function breakdownToVector(b: ReturnType<typeof computeSettlementBreakdown>): SettlementVector {
  return {
    buyerRefundCents: b.buyerRefundCents,
    sellerPayoutCents: b.sellerGrossCents,
    haulerPayoutCents: b.haulerNetCents,
    platformFeeCents: b.platformFeeCents,
  };
}

/**
 * Executes one transfer with full idempotency. Never double-moves money:
 * SUCCEEDED intents are skipped, FAILED intents are only retried within the
 * attempt budget, and transient provider errors rethrow for queue backoff.
 */
async function executeTransfer(
  intent: PaymentIntent,
  provider: PaymentProvider,
): Promise<void> {
  if (intent.status === "SUCCEEDED") return;
  if (intent.status === "FAILED") {
    if (intent.attemptNumber >= MAX_SETTLEMENT_ATTEMPTS) {
      throw new SettlementFailedError(`transfer ${intent.id} permanently failed`, {
        escrowId: intent.escrowId,
        rail: intent.rail,
        errorCode: intent.errorCode,
        errorMessage: intent.errorMessage,
      });
    }
    // A previously-failed intent may be retried within the budget.
  }
  if (intent.status === "CANCELED") {
    throw new SettlementFailedError(`transfer ${intent.id} was canceled`, { escrowId: intent.escrowId });
  }

  if (!intent.destinationAccountRef) {
    await markIntentFailed(intent, "NO_DESTINATION", "destination account is not configured");
    throw new SettlementFailedError(`transfer ${intent.id} has no destination account`, {
      escrowId: intent.escrowId,
    });
  }

  try {
    const result = await provider.transferFromFbo({
      destinationAccountRef: intent.destinationAccountRef,
      amountCents: intent.amountCents,
      currency: intent.currency,
      idempotencyKey: intent.idempotencyKey,
      metadata: { escrowId: intent.escrowId, paymentIntentId: intent.id },
    });

    await runEscrowTransaction(async (tx) => {
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: "SUCCEEDED",
          railReferenceId: result.railReferenceId,
          attemptNumber: { increment: 1 },
        },
      });
      await tx.ledgerEntry.updateMany({
        where: { idempotencyKey: intent.idempotencyKey },
        data: { status: "COMMITTED", committedAt: new Date() },
      });
    });
  } catch (err) {
    if (err instanceof PaymentProviderError) {
      if (err.retryable) {
        await prisma.paymentIntent.update({
          where: { id: intent.id },
          data: { attemptNumber: { increment: 1 } },
        });
        throw err; // queue retries with exponential backoff
      }
      await markIntentFailed(intent, "RAIL_REJECTED", err.message);
      throw new SettlementFailedError(`transfer ${intent.id} rejected by rail: ${err.message}`, {
        escrowId: intent.escrowId,
      });
    }
    throw err;
  }
}

async function markIntentFailed(intent: PaymentIntent, errorCode: string, errorMessage: string): Promise<void> {
  await runEscrowTransaction(async (tx) => {
    await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "FAILED",
        errorCode,
        errorMessage,
        attemptNumber: { increment: 1 },
      },
    });
    // The PENDING ledger entry never hit the balance view; mark it FAILED so
    // the escrow account stays whole. Reversal entries are only needed for
    // COMMITTED entries (e.g. chargebacks) — see reverseEntry().
    await tx.ledgerEntry.updateMany({
      where: { idempotencyKey: intent.idempotencyKey },
      data: { status: "FAILED" },
    });
  });
}

// --- provider wiring ----------------------------------------------------------

let stripeProviderSingleton: StripeProvider | null = null;
let dwollaProviderSingleton: DwollaProvider | null = null;

export function getProvider(rail: RailName, overrides?: Partial<Record<RailName, PaymentProvider>>): PaymentProvider {
  const override = overrides?.[rail];
  if (override) return override;
  // Local development/demo mode: simulate the rail synchronously instead of
  // requiring real Stripe/Dwolla keys. Never active in production (the env
  // var is only set in .env for dev). See dryRunProvider.ts.
  if (process.env.PAYMENTS_DRY_RUN === "true") {
    return getDryRunProvider(rail);
  }
  if (rail === "STRIPE") {
    stripeProviderSingleton ??= StripeProvider.fromEnv();
    return stripeProviderSingleton;
  }
  dwollaProviderSingleton ??= DwollaProvider.fromEnv();
  return dwollaProviderSingleton;
}

let dryRunProviderSingleton: DryRunProvider | null = null;
function getDryRunProvider(rail: RailName): DryRunProvider {
  dryRunProviderSingleton ??= new DryRunProvider(rail);
  if (dryRunProviderSingleton.rail !== rail) {
    // Both rails share one simulation process; a single provider is enough.
    return new DryRunProvider(rail);
  }
  return dryRunProviderSingleton;
}

/**
 * Determines which rail the escrow settles on. The platform `paymentRail`
 * setting (PlatformSetting key `paymentRail`, default STRIPE) is the
 * authoritative settlement rail: every party must have a destination account
 * onboarded on that rail, otherwise settlement is refused rather than
 * silently crossing rails.
 *
 * Stripe connected accounts look like `acct_...`; Dwolla funding sources are
 * resource URLs (`http...`). The destination refs are validation, not
 * selection — the operator decides the rail, the wallets prove onboarding.
 */
async function selectRailForEscrow(
  tx: Prisma.TransactionClient,
  escrow: Pick<EscrowTransaction, "sellerId" | "haulerId" | "buyerId">,
): Promise<RailName> {
  const setting = await tx.platformSetting.findUnique({ where: { key: "paymentRail" } });
  const preferred: RailName = setting?.value === "DWOLLA" ? "DWOLLA" : "STRIPE";

  const accounts: Array<LedgerAccountRef & { id: string; externalAccountRef: string | null }> = [];
  for (const userId of [escrow.sellerId, escrow.haulerId, escrow.buyerId]) {
    const wallet = await ensureLedgerAccount(tx, { accountType: "USER_WALLET", ownerUserId: userId });
    accounts.push(wallet as never);
  }
  const refs = accounts.map((a) => a.externalAccountRef ?? "");
  const missing = refs.filter((r) => r.length === 0).length;
  if (missing > 0) {
    throw new ValidationError(`payout destination missing for ${missing} party/ies on this escrow`);
  }
  const offRail = refs.filter((r) =>
    preferred === "STRIPE" ? !r.startsWith("acct_") : !r.startsWith("http"),
  );
  if (offRail.length > 0) {
    throw new ValidationError(
      `party destinations are not onboarded on the configured ${preferred} rail`,
      { refs },
    );
  }
  return preferred;
}
