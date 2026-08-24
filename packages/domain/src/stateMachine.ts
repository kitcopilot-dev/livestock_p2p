import type { AutomatedDispute, EscrowTransaction, EscrowStatus } from "@livestock/db";
import { IllegalTransitionError } from "./errors";

/**
 * Formal state machine for the escrow lifecycle.
 *
 *   DRAFT -> FUNDED -> IN_TRANSIT -> DELIVERED -> INSPECTION_PERIOD
 *    |                        |-> DISPUTED -> ARBITRATION_PROCESSING
 *    |                        |-> RESOLVED_DISBURSED (auto-release)
 *    |-> PENDING_PAYMENT -> FUNDED (buyer pays later) -> IN_TRANSIT
 *    |-> PENDING_PAYMENT -> CANCELLED
 *   INSPECTION_PERIOD / ARBITRATION_PROCESSING -> RESOLVED_DISBURSED | REFUNDED
 *
 * Transitions are declared with their guards; `assertTransition` is the only
 * way the codebase moves an escrow between states. Guards are pure predicates
 * over (escrow, actor, now, meta) so the whole matrix is unit-testable and the
 * dispute-vs-timer race is decided deterministically under the row lock.
 */

export type EscrowActor =
  | "BUYER"
  | "SELLER"
  | "HAULER"
  | "PLATFORM"
  | "SYSTEM_TIMER"
  | "SYSTEM_ARBITER";

export interface TransitionMeta {
  /** The (single, possibly resolved) dispute for the escrow. */
  dispute?: AutomatedDispute | null;
  /** True when every payout of the settlement executed successfully. */
  settlementSuccess?: boolean;
  /** True when a RELEASED milestone already exists (double-release guard). */
  releasedMilestoneExists?: boolean;
}

export interface TransitionContext {
  escrow: Pick<EscrowTransaction, "status" | "inspectionDeadlineAt" | "disputeProofDeadlineAt">;
  actor: EscrowActor;
  now: Date;
  meta?: TransitionMeta;
}

export type GuardResult = { ok: true } | { ok: false; reason: string };
export type Guard = (ctx: TransitionContext) => GuardResult;

const ok: GuardResult = { ok: true };
const deny = (reason: string): GuardResult => ({ ok: false, reason });

// --- guard factories ---------------------------------------------------------

function actorIs(...actors: EscrowActor[]): Guard {
  return (ctx) => (actors.includes(ctx.actor) ? ok : deny(`actor ${ctx.actor} not allowed`));
}

function nowBefore(field: "inspectionDeadlineAt"): Guard {
  return (ctx) => {
    const deadline = ctx.escrow[field];
    if (!deadline) return ok; // no deadline configured yet
    return ctx.now.getTime() <= deadline.getTime() ? ok : deny(`${field} has passed`);
  };
}

function nowAtOrAfter(field: "inspectionDeadlineAt"): Guard {
  return (ctx) => {
    const deadline = ctx.escrow[field];
    if (!deadline) return deny(`${field} is not configured`);
    return ctx.now.getTime() >= deadline.getTime() ? ok : deny(`${field} has not been reached`);
  };
}

const noOpenDispute: Guard = (ctx) => {
  const d = ctx.meta?.dispute;
  if (!d) return ok;
  if (d.status === "OPEN" || d.status === "ARBITRATION_PROCESSING") {
    return deny("an open dispute blocks this transition");
  }
  return ok;
};

const noReleasedMilestone: Guard = (ctx) =>
  ctx.meta?.releasedMilestoneExists ? deny("funds were already released") : ok;

const settlementSucceeded: Guard = (ctx) =>
  ctx.meta?.settlementSuccess ? ok : deny("settlement has not succeeded");

const disputeResolved: Guard = (ctx) => {
  const d = ctx.meta?.dispute;
  if (!d) return deny("no dispute record found");
  if (
    d.status === "RESOLVED_BUYER_WINS" ||
    d.status === "RESOLVED_SELLER_WINS" ||
    d.status === "RESOLVED_SPLIT"
  ) {
    return ok;
  }
  return deny(`dispute is not resolved (${d.status})`);
};

// --- transition table ---------------------------------------------------------

export const ESCROW_TRANSITIONS: Record<
  EscrowStatus,
  Partial<Record<EscrowStatus, Guard[]>>
> = {
  DRAFT: {
    FUNDED: [actorIs("BUYER", "PLATFORM", "SYSTEM_ARBITER")],
    PENDING_PAYMENT: [actorIs("BUYER", "PLATFORM")],
    CANCELLED: [actorIs("BUYER", "PLATFORM")],
  },
  PENDING_PAYMENT: {
    FUNDED: [actorIs("BUYER", "PLATFORM")],
    // SYSTEM_TIMER = the financing-deadline job auto-cancelling an unfunded
    // escrow once paymentDeadlineAt passes.
    CANCELLED: [actorIs("BUYER", "PLATFORM", "SYSTEM_TIMER")],
  },
  FUNDED: {
    IN_TRANSIT: [actorIs("HAULER", "PLATFORM")],
    CANCELLED: [actorIs("BUYER", "PLATFORM")],
  },
  IN_TRANSIT: {
    DELIVERED: [actorIs("HAULER", "PLATFORM")],
  },
  DELIVERED: {
    // markDelivered() performs DELIVERED -> INSPECTION_PERIOD atomically and
    // stamps inspectionDeadlineAt = now + 24h in the same transaction.
    INSPECTION_PERIOD: [actorIs("HAULER", "PLATFORM")],
  },
  INSPECTION_PERIOD: {
    // Buyer files a dispute — only while the 24h window is open.
    DISPUTED: [actorIs("BUYER", "SYSTEM_TIMER"), nowBefore("inspectionDeadlineAt")],
    // Auto-release by the time-locked scheduler (or a manual platform action
    // after the deadline, used by reconciliation).
    RESOLVED_DISBURSED: [
      actorIs("SYSTEM_TIMER", "PLATFORM", "SYSTEM_ARBITER"),
      nowAtOrAfter("inspectionDeadlineAt"),
      noOpenDispute,
      noReleasedMilestone,
      settlementSucceeded,
    ],
    // Full refund path (buyer prevails before formal arbitration).
    REFUNDED: [actorIs("SYSTEM_ARBITER", "PLATFORM", "BUYER"), noReleasedMilestone],
  },
  DISPUTED: {
    // Escalation after the 48h evidence window (or by request).
    ARBITRATION_PROCESSING: [actorIs("SYSTEM_TIMER", "SYSTEM_ARBITER", "PLATFORM")],
  },
  ARBITRATION_PROCESSING: {
    RESOLVED_DISBURSED: [
      actorIs("SYSTEM_ARBITER", "SYSTEM_TIMER"),
      disputeResolved,
      settlementSucceeded,
    ],
    REFUNDED: [actorIs("SYSTEM_ARBITER"), disputeResolved, settlementSucceeded],
  },
  RESOLVED_DISBURSED: {},
  REFUNDED: {},
  CANCELLED: {},
};

export function isTerminal(status: EscrowStatus): boolean {
  return status === "RESOLVED_DISBURSED" || status === "REFUNDED" || status === "CANCELLED";
}

/**
 * Validates a transition. Throws IllegalTransitionError with all failing
 * guard reasons when the move is not allowed — never silently no-ops, so
 * callers must catch the specific error when racing is expected (timer vs
 * buyer dispute).
 */
export function assertTransition(from: EscrowStatus, to: EscrowStatus, ctx: TransitionContext): void {
  if (from === to) {
    throw new IllegalTransitionError(from, to, ["state is unchanged"]);
  }
  const guards = ESCROW_TRANSITIONS[from]?.[to];
  if (!guards || guards.length === 0) {
    throw new IllegalTransitionError(from, to, ["no transition declared"]);
  }
  const failures: string[] = [];
  for (const guard of guards) {
    const result = guard(ctx);
    if (!result.ok) failures.push(result.reason);
  }
  if (failures.length > 0) {
    throw new IllegalTransitionError(from, to, failures);
  }
}

/** True when the transition is declared at all (used for pre-checks). */
export function isTransitionDeclared(from: EscrowStatus, to: EscrowStatus): boolean {
  return !!ESCROW_TRANSITIONS[from]?.[to];
}

/**
 * Runs the guards for INSPECTION_PERIOD/ARBITRATION_PROCESSING ->
 * RESOLVED_DISBURSED EXCEPT `settlementSucceeded` — used by the settlement
 * orchestrator as a pre-flight before any rail call. The final
 * TransactionManager.markSettled() re-runs the full guard set (including
 * settlementSuccess) under the row lock before the terminal transition.
 */
export function assertPreSettlementEligible(ctx: TransitionContext): void {
  const guards = ESCROW_TRANSITIONS[ctx.escrow.status]?.["RESOLVED_DISBURSED"] ?? [];
  if (guards.length === 0) {
    throw new IllegalTransitionError(ctx.escrow.status, "RESOLVED_DISBURSED", ["no transition declared"]);
  }
  const failures: string[] = [];
  for (const guard of guards) {
    if (guard === settlementSucceeded) continue;
    const result = guard(ctx);
    if (!result.ok) failures.push(result.reason);
  }
  if (failures.length > 0) {
    throw new IllegalTransitionError(ctx.escrow.status, "RESOLVED_DISBURSED", failures);
  }
}
