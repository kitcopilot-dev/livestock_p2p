import { describe, expect, it } from "vitest";
import type { EscrowTransaction } from "@livestock/db";
import {
  assertPreSettlementEligible,
  assertTransition,
  isTransitionDeclared,
  IllegalTransitionError,
  type TransitionContext,
} from "../src/stateMachine";

const baseEscrow = {
  status: "INSPECTION_PERIOD",
  inspectionDeadlineAt: new Date("2026-08-20T12:00:00Z"),
  disputeProofDeadlineAt: null,
} as unknown as EscrowTransaction;

function ctx(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    escrow: baseEscrow,
    actor: "SYSTEM_TIMER",
    now: new Date("2026-08-20T12:00:00Z"),
    meta: { dispute: null, releasedMilestoneExists: false, settlementSuccess: true },
    ...overrides,
  };
}

describe("escrow state machine", () => {
  it("declares the full happy path chain", () => {
    const chain: Array<[string, string]> = [
      ["DRAFT", "FUNDED"],
      ["FUNDED", "IN_TRANSIT"],
      ["IN_TRANSIT", "DELIVERED"],
      ["DELIVERED", "INSPECTION_PERIOD"],
      ["INSPECTION_PERIOD", "DISPUTED"],
      ["DISPUTED", "ARBITRATION_PROCESSING"],
      ["ARBITRATION_PROCESSING", "RESOLVED_DISBURSED"],
    ];
    for (const [from, to] of chain) {
      expect(isTransitionDeclared(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("rejects undeclared transitions", () => {
    expect(() =>
      assertTransition("DRAFT", "RESOLVED_DISBURSED", ctx()),
    ).toThrowError(IllegalTransitionError);
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "FUNDED", ctx()),
    ).toThrowError(IllegalTransitionError);
    expect(() =>
      assertTransition("RESOLVED_DISBURSED", "FUNDED", ctx()),
    ).toThrowError(IllegalTransitionError);
  });

  it("allows the timer to auto-release only after the deadline", () => {
    assertTransition("INSPECTION_PERIOD", "RESOLVED_DISBURSED", ctx());
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "RESOLVED_DISBURSED", ctx({
        now: new Date("2026-08-20T11:59:59Z"),
      })),
    ).toThrowError(/has not been reached/);
  });

  it("allows the buyer to dispute only before the deadline", () => {
    assertTransition("INSPECTION_PERIOD", "DISPUTED", ctx({ actor: "BUYER" }));
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "DISPUTED", ctx({
        actor: "BUYER",
        now: new Date("2026-08-20T12:00:01Z"),
      })),
    ).toThrowError(/has passed/);
    // A seller may never file the buyer's dispute.
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "DISPUTED", ctx({ actor: "SELLER" })),
    ).toThrowError(/actor SELLER not allowed/);
  });

  it("blocks auto-release while a dispute is open", () => {
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "RESOLVED_DISBURSED", ctx({
        meta: { dispute: { status: "OPEN" } as never, releasedMilestoneExists: false, settlementSuccess: true },
      })),
    ).toThrowError(/open dispute/);
  });

  it("blocks double release", () => {
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "RESOLVED_DISBURSED", ctx({
        meta: { dispute: null, releasedMilestoneExists: true, settlementSuccess: true },
      })),
    ).toThrowError(/already released/);
  });

  it("blocks release before settlement succeeded", () => {
    expect(() =>
      assertTransition("INSPECTION_PERIOD", "RESOLVED_DISBURSED", ctx({
        meta: { dispute: null, releasedMilestoneExists: false, settlementSuccess: false },
      })),
    ).toThrowError(/settlement has not succeeded/);
  });

  it("pre-settlement check skips only the money guard", () => {
    // Settlement pre-flight passes even though payouts haven't run yet.
    assertPreSettlementEligible(ctx());
    // ...but still enforces the deadline and dispute guards.
    expect(() =>
      assertPreSettlementEligible(ctx({ now: new Date("2026-08-20T11:00:00Z") })),
    ).toThrowError(/has not been reached/);
  });

  it("arbitration release requires a resolved dispute", () => {
    const arbCtx = (status: string) =>
      ctx({
        escrow: {
          ...baseEscrow,
          status: "ARBITRATION_PROCESSING",
        } as unknown as EscrowTransaction,
        actor: "SYSTEM_ARBITER",
        meta: { dispute: { status } as never, releasedMilestoneExists: false, settlementSuccess: true },
      });
    expect(() =>
      assertTransition("ARBITRATION_PROCESSING", "RESOLVED_DISBURSED", arbCtx("OPEN")),
    ).toThrowError(/dispute is not resolved/);
    assertTransition("ARBITRATION_PROCESSING", "RESOLVED_DISBURSED", arbCtx("RESOLVED_SPLIT"));
    // A resolved dispute still needs settlement success.
    expect(() =>
      assertTransition("ARBITRATION_PROCESSING", "RESOLVED_DISBURSED", arbCtx("RESOLVED_SPLIT").meta
        ? { ...arbCtx("RESOLVED_SPLIT"), meta: { ...arbCtx("RESOLVED_SPLIT").meta, settlementSuccess: false } }
        : arbCtx("RESOLVED_SPLIT")),
    ).toThrowError(/settlement has not succeeded/);
  });
});
