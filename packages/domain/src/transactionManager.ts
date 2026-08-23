import {
  Prisma,
  prisma,
  type AutomatedDispute,
  type DisputeReason,
  type EscrowTransaction,
  type EscrowStatus,
} from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import {
  DISPUTE_PROOF_WINDOW_MS,
  INSPECTION_WINDOW_MS,
  getDisputeProofWindowMs,
  getInspectionWindowMs,
  cents,
  formatEscrowReference,
  fundingKey,
  roundHalfUp,
  type Cents,
} from "@livestock/shared";
import { EscrowNotFoundError } from "./errors";
import { ensureLedgerAccount, postEntry } from "./ledger";
import type { SettlementVector } from "./splits";
import {
  assertTransition,
  isTerminal,
  type EscrowActor,
  type TransitionMeta,
} from "./stateMachine";

/**
 * Immutable, state-safe Transaction Manager.
 *
 * Concurrency protocol (used by every mutator):
 *   1. SERIALIZABLE isolation level for the whole transaction
 *   2. SELECT ... FOR UPDATE on the escrow row — the single serialization
 *      point for the dispute-vs-timer race
 *   3. re-read state under the lock, then assertTransition() with window
 *      checks (24h deadline, 48h proof deadline)
 *   4. mutate + milestone + audit row, all in the same transaction
 *
 * Because both `fileDispute` and `autoReleaseFunds` acquire the same row lock,
 * exactly one wins; the loser's guards fail against the fresh state and the
 * caller handles the typed error (timer -> no-op, buyer -> window closed).
 */
export class TransactionManager {
  #clock: () => Date;

  constructor(opts: { clock?: () => Date } = {}) {
    this.#clock = opts.clock ?? (() => new Date());
  }

  now(): Date {
    return this.#clock();
  }

  // --- reads ----------------------------------------------------------------

  async getEscrow(escrowId: string): Promise<EscrowTransaction | null> {
    return prisma.escrowTransaction.findUnique({ where: { id: escrowId } });
  }

  async getEscrowWithDispute(escrowId: string): Promise<{
    escrow: EscrowTransaction;
    dispute: AutomatedDispute | null;
  } | null> {
    const escrow = await prisma.escrowTransaction.findUnique({ where: { id: escrowId } });
    if (!escrow) return null;
    const dispute = await prisma.automatedDispute.findFirst({
      where: { escrowId },
      orderBy: { filedAt: "desc" },
    });
    return { escrow, dispute };
  }

  // --- lifecycle --------------------------------------------------------------

  async createDraft(input: {
    buyerId: string;
    sellerId: string;
    haulerId: string;
    saleAmountCents: number;
    contractedWeightLbs: number;
    weightTolerancePct?: number;
    freightFeeCents: number;
    platformFeeBps: number;
  }): Promise<EscrowTransaction> {
    const now = this.now();
    const pricePerLbMicros = roundHalfUp(
      (input.saleAmountCents * 1_000_000) / input.contractedWeightLbs,
    );

    return runEscrowTransaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ nextval: string }>>`
          SELECT nextval('escrow_reference_seq')::text AS nextval`;
        const seq = Number(rows[0]!.nextval);
        const reference = formatEscrowReference(seq, now);

        const escrow = await tx.escrowTransaction.create({
          data: {
            reference,
            buyerId: input.buyerId,
            sellerId: input.sellerId,
            haulerId: input.haulerId,
            status: "DRAFT",
            saleAmountCents: input.saleAmountCents,
            contractedWeightLbs: input.contractedWeightLbs,
            weightTolerancePct: input.weightTolerancePct ?? 2,
            pricePerLbMicros,
            freightFeeCents: input.freightFeeCents,
            platformFeeBps: input.platformFeeBps,
          },
        });

        await tx.milestone.create({
          data: { escrowId: escrow.id, kind: "CREATED", occurredAt: now },
        });
        await auditLogger.write(tx, {
          actorRole: "PLATFORM",
          action: "ESCROW_CREATED",
          entityType: "EscrowTransaction",
          entityId: escrow.id,
          after: { reference, saleAmountCents: input.saleAmountCents },
        });
        return escrow;
      },
    );
  }

  /**
   * Marks the escrow FUNDED after the buyer's charge was captured by the rail
   * (webhook-driven). Posts the funding journal entry in the same transaction.
   */
  async fund(escrowId: string, ctx: { actor: EscrowActor; userId?: string }): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        assertTransition(escrow.status, "FUNDED", { escrow, actor: ctx.actor, now });

        const escrowAccount = await ensureLedgerAccount(tx, { accountType: "PLATFORM_ESCROW" });
        const buyerWallet = await ensureLedgerAccount(tx, {
          accountType: "USER_WALLET",
          ownerUserId: escrow.buyerId,
        });
        await postEntry(tx, {
          leg: {
            debitAccountId: buyerWallet.id,
            creditAccountId: escrowAccount.id,
            amountCents: cents(escrow.saleAmountCents),
          },
          entryType: "FUNDING",
          transactionId: escrowId,
          idempotencyKey: fundingKey(escrowId),
          description: `Buyer funding for ${escrow.reference}`,
        });

        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: { status: "FUNDED", version: { increment: 1 } },
        });
        await tx.milestone.create({
          data: { escrowId, kind: "FUNDED", occurredAt: now, actorUserId: ctx.userId },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_FUNDED",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "FUNDED" },
        });
        return updated;
      },
    );
  }

  /**
   * Moves an escrow from DRAFT to PENDING_PAYMENT (financing option).
   * The buyer can pay later from the escrow detail page.
   */
  async markPendingPayment(escrowId: string, ctx: { actor: EscrowActor; userId?: string }): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        assertTransition(escrow.status, "PENDING_PAYMENT", { escrow, actor: ctx.actor, now });
        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: { status: "PENDING_PAYMENT", version: { increment: 1 } },
        });
        await tx.milestone.create({
          data: { escrowId, kind: "CREATED", occurredAt: now, actorUserId: ctx.userId },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_PENDING_PAYMENT",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "PENDING_PAYMENT" },
        });
        return updated;
      },
    );
  }

  async cancel(escrowId: string, ctx: { actor: EscrowActor; userId?: string }): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        assertTransition(escrow.status, "CANCELLED", { escrow, actor: ctx.actor, now });
        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        await tx.milestone.create({
          data: { escrowId, kind: "CANCELLED", occurredAt: now, actorUserId: ctx.userId },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_CANCELLED",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "CANCELLED" },
        });
        return updated;
      },
    );
  }

  async markInTransit(
    escrowId: string,
    ctx: { actor: EscrowActor; userId?: string },
  ): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        assertTransition(escrow.status, "IN_TRANSIT", { escrow, actor: ctx.actor, now });
        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: { status: "IN_TRANSIT", version: { increment: 1 } },
        });
        await tx.milestone.create({
          data: { escrowId, kind: "PICKUP", occurredAt: now, actorUserId: ctx.userId },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_IN_TRANSIT",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "IN_TRANSIT" },
        });
        return updated;
      },
    );
  }

  /**
   * Delivery confirmation. Atomically moves DELIVERED -> INSPECTION_PERIOD and
   * stamps inspectionDeadlineAt = now + 24h. The scheduler (BullMQ) enqueues
   * the auto-release job for that instant; the reconciliation sweep is the
   * backstop if the queue ever loses it.
   */
  async markDelivered(
    escrowId: string,
    ctx: { actor: EscrowActor; userId?: string },
    opts: { deliveredWeightLbs?: number | null; inspectionWindowMs?: number } = {},
  ): Promise<EscrowTransaction> {
    const now = this.now();
    const windowMs = opts.inspectionWindowMs ?? getInspectionWindowMs();
    const inspectionDeadlineAt = new Date(now.getTime() + windowMs);

    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        assertTransition(escrow.status, "DELIVERED", { escrow, actor: ctx.actor, now });
        assertTransition("DELIVERED", "INSPECTION_PERIOD", { escrow, actor: ctx.actor, now });

        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: {
            status: "INSPECTION_PERIOD",
            inspectionDeadlineAt,
            deliveredWeightLbs: opts.deliveredWeightLbs ?? escrow.deliveredWeightLbs,
            version: { increment: 1 },
          },
        });

        await tx.milestone.create({
          data: { escrowId, kind: "DELIVERED", occurredAt: now, actorUserId: ctx.userId },
        });
        await tx.milestone.create({
          data: {
            escrowId,
            kind: "INSPECTION_STARTED",
            occurredAt: now,
            dueAt: inspectionDeadlineAt,
            actorUserId: ctx.userId,
            metadata: { inspectionWindowMs: windowMs },
          },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_DELIVERED",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "INSPECTION_PERIOD", inspectionDeadlineAt: inspectionDeadlineAt.toISOString() },
        });
        return updated;
      },
    );
  }

  /**
   * Buyer files a dispute. Only legal while the 24h inspection window is open.
   * Loses the race against autoReleaseFunds() cleanly: if the funds were
   * already released, the row lock re-read shows RESOLVED_DISBURSED and the
   * transition guard throws InspectionWindowClosedError.
   */
  async fileDispute(
    escrowId: string,
    input: { filedByUserId: string; reason: DisputeReason; description?: string },
    ctx: { actor: EscrowActor; userId?: string },
    opts: { disputeProofWindowMs?: number } = {},
  ): Promise<{ escrow: EscrowTransaction; dispute: AutomatedDispute }> {
    const now = this.now();
    const proofDeadline = new Date(now.getTime() + (opts.disputeProofWindowMs ?? getDisputeProofWindowMs()));

    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        const existing = await tx.automatedDispute.findFirst({
          where: { escrowId, status: { in: ["OPEN", "ARBITRATION_PROCESSING"] } },
        });
        assertTransition(escrow.status, "DISPUTED", {
          escrow,
          actor: ctx.actor,
          now,
          meta: { dispute: existing },
        });

        const dispute = await tx.automatedDispute.create({
          data: {
            escrowId,
            filedByUserId: input.filedByUserId,
            reason: input.reason,
            description: input.description,
            status: "OPEN",
          },
        });
        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: {
            status: "DISPUTED",
            disputeProofDeadlineAt: proofDeadline,
            version: { increment: 1 },
          },
        });
        await tx.milestone.create({
          data: {
            escrowId,
            kind: "DISPUTE_FILED",
            occurredAt: now,
            actorUserId: input.filedByUserId,
            metadata: { disputeId: dispute.id, reason: input.reason },
          },
        });
        await tx.milestone.create({
          data: {
            escrowId,
            kind: "DISPUTE_PROOF_DEADLINE",
            occurredAt: now,
            dueAt: proofDeadline,
            actorUserId: input.filedByUserId,
          },
        });
        await auditLogger.write(tx, {
          actorUserId: input.filedByUserId,
          actorRole: ctx.actor,
          action: "DISPUTE_FILED",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          after: { disputeId: dispute.id, reason: input.reason },
        });
        return { escrow: updated, dispute };
      },
    );
  }

  /** Escalate DISPUTED -> ARBITRATION_PROCESSING (after the 48h proof window). */
  async submitForArbitration(
    disputeId: string,
    ctx: { actor: EscrowActor; userId?: string },
  ): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const dispute = await tx.automatedDispute.findUnique({ where: { id: disputeId } });
        if (!dispute) throw new EscrowNotFoundError(disputeId);
        const escrow = await lockEscrow(tx, dispute.escrowId);
        assertTransition(escrow.status, "ARBITRATION_PROCESSING", {
          escrow,
          actor: ctx.actor,
          now,
          meta: { dispute },
        });
        await tx.automatedDispute.update({
          where: { id: disputeId },
          data: { status: "ARBITRATION_PROCESSING" },
        });
        const updated = await tx.escrowTransaction.update({
          where: { id: escrow.id },
          data: { status: "ARBITRATION_PROCESSING", version: { increment: 1 } },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ARBITRATION_STARTED",
          entityType: "EscrowTransaction",
          entityId: escrow.id,
          after: { disputeId },
        });
        return updated;
      },
    );
  }

  /**
   * Final transition executed by the settlement orchestrator AFTER every rail
   * payout succeeded. Guards differ by origin: the inspection-period auto
   * release requires the deadline to have passed with no open dispute; the
   * arbitration path requires a resolved dispute.
   */
  async markSettled(
    escrowId: string,
    ctx: {
      actor: EscrowActor;
      vector?: SettlementVector;
      platformFeeCents?: Cents;
      shrinkPenaltyCents?: Cents;
      userId?: string;
    },
  ): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        if (isTerminal(escrow.status)) {
          throw new IllegalStateError(`escrow already terminal (${escrow.status})`);
        }
        const dispute = await tx.automatedDispute.findFirst({
          where: { escrowId },
          orderBy: { filedAt: "desc" },
        });
        const releasedExists = !!(await tx.milestone.findFirst({
          where: { escrowId, kind: "RELEASED" },
        }));
        const meta: TransitionMeta = {
          dispute,
          releasedMilestoneExists: releasedExists,
          settlementSuccess: true,
        };
        assertTransition(escrow.status, "RESOLVED_DISBURSED", {
          escrow,
          actor: ctx.actor,
          now,
          meta,
        });

        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: {
            status: "RESOLVED_DISBURSED",
            settlementAt: now,
            platformFeeCents: ctx.platformFeeCents ?? escrow.platformFeeCents,
            shrinkPenaltyCents: ctx.shrinkPenaltyCents ?? escrow.shrinkPenaltyCents,
            version: { increment: 1 },
          },
        });
        await tx.milestone.create({
          data: {
            escrowId,
            kind: "RELEASED",
            occurredAt: now,
            actorUserId: ctx.userId,
            metadata: { vector: ctx.vector } as unknown as Prisma.InputJsonValue,
          },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_RESOLVED_DISBURSED",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "RESOLVED_DISBURSED", vector: ctx.vector, settlementAt: now.toISOString() },
        });
        return updated;
      },
    );
  }

  /** Full-refund terminal transition (buyer prevails; all funds returned). */
  async refund(
    escrowId: string,
    ctx: { actor: EscrowActor; vector: SettlementVector; userId?: string },
  ): Promise<EscrowTransaction> {
    const now = this.now();
    return runEscrowTransaction(
      async (tx) => {
        const escrow = await lockEscrow(tx, escrowId);
        const dispute = await tx.automatedDispute.findFirst({
          where: { escrowId },
          orderBy: { filedAt: "desc" },
        });
        const releasedExists = !!(await tx.milestone.findFirst({
          where: { escrowId, kind: "RELEASED" },
        }));
        assertTransition(escrow.status, "REFUNDED", {
          escrow,
          actor: ctx.actor,
          now,
          meta: { dispute, releasedMilestoneExists: releasedExists, settlementSuccess: true },
        });

        const updated = await tx.escrowTransaction.update({
          where: { id: escrowId },
          data: {
            status: "REFUNDED",
            settlementAt: now,
            version: { increment: 1 },
          },
        });
        await tx.milestone.create({
          data: {
            escrowId,
            kind: "REFUNDED",
            occurredAt: now,
            actorUserId: ctx.userId,
            metadata: { vector: ctx.vector } as unknown as Prisma.InputJsonValue,
          },
        });
        await auditLogger.write(tx, {
          actorUserId: ctx.userId,
          actorRole: ctx.actor,
          action: "ESCROW_REFUNDED",
          entityType: "EscrowTransaction",
          entityId: escrowId,
          before: { status: escrow.status },
          after: { status: "REFUNDED", vector: ctx.vector },
        });
        return updated;
      },
    );
  }
}

// --- helpers ------------------------------------------------------------------

export class IllegalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalStateError";
  }
}

async function lockEscrow(
  tx: Prisma.TransactionClient,
  escrowId: string,
): Promise<EscrowTransaction> {
  const rows = await tx.$queryRaw<EscrowTransaction[]>`
    SELECT * FROM "EscrowTransaction" WHERE id = ${escrowId} FOR UPDATE`;
  const escrow = rows[0];
  if (!escrow) {
    throw new EscrowNotFoundError(escrowId);
  }
  return escrow;
}

/**
 * Optimistic-concurrency wrapper for read-heavy status endpoints: updates only
 * when `version` still matches, retrying the whole callback with backoff on
 * CONCURRENT_MODIFICATION. The pessimistic path above remains the default for
 * money-critical transitions.
 */
export async function withOptimisticRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; retryDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "CONCURRENT_MODIFICATION" || attempt === maxAttempts - 1) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? 50 * Math.pow(2, attempt)));
    }
  }
  throw new IllegalStateError("unreachable");
}

/**
 * Runs an escrow mutation under SERIALIZABLE isolation with retry on
 * serialization failures.
 *
 * PostgreSQL aborts one of two concurrent serializable transactions with
 * `40001 could not serialize access` (Prisma surfaces this as P2034 for
 * interactive transactions, or as the raw DB code for queries). This is NOT an
 * error condition — it is the isolation guarantee working. We retry the whole
 * callback with jitter; on the retry the row lock re-read sees the winner's
 * committed state and the guards produce the correct deterministic outcome
 * (e.g. dispute won -> timer no-ops).
 */
export async function runEscrowTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 20_000,
      });
    } catch (err) {
      lastError = err;
      if (!isSerializationFailure(err) || attempt === 2) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 40));
    }
  }
  throw lastError;
}

export function isSerializationFailure(err: unknown): boolean {
  const e = err as { code?: string; message?: string; meta?: { code?: string } };
  if (e.code === "P2034") return true; // Prisma: write conflict / deadlock in interactive tx
  if (e.meta?.code === "40001") return true; // PostgreSQL serialization failure
  return typeof e.message === "string" && e.message.includes("could not serialize access");
}
