import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { seedUser, truncateAll } from "@livestock/db/testing";
import { resolveArbitration } from "../src/disputes";
import { TransactionManager } from "../src/transactionManager";
import { IllegalTransitionError } from "../src/errors";

let tm: TransactionManager;
let buyer: { id: string };
let seller: { id: string };
let hauler: { id: string };

beforeAll(async () => {
  await truncateAll();
  buyer = await seedUser({ role: "BUYER" });
  seller = await seedUser({ role: "SELLER" });
  hauler = await seedUser({ role: "HAULER" });
  tm = new TransactionManager();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newEscrow() {
  return tm.createDraft({
    buyerId: buyer.id,
    sellerId: seller.id,
    haulerId: hauler.id,
    saleAmountCents: 100_000_00,
    contractedWeightLbs: 50_000,
    freightFeeCents: 50_000_00,
    platformFeeBps: 250,
  });
}

async function toInspection(escrowId: string, opts?: { inspectionWindowMs?: number }) {
  await tm.fund(escrowId, { actor: "PLATFORM" });
  await tm.markInTransit(escrowId, { actor: "HAULER", userId: hauler.id });
  return tm.markDelivered(escrowId, { actor: "HAULER", userId: hauler.id }, opts);
}

describe("TransactionManager lifecycle", () => {
  it("walks the happy path DRAFT -> ... -> INSPECTION_PERIOD with deadlines", async () => {
    const escrow = await newEscrow();
    expect(escrow.status).toBe("DRAFT");
    expect(escrow.reference).toMatch(/^ESC-2026-\d{6}$/);

    const funded = await tm.fund(escrow.id, { actor: "PLATFORM" });
    expect(funded.status).toBe("FUNDED");

    const inTransit = await tm.markInTransit(escrow.id, { actor: "HAULER", userId: hauler.id });
    expect(inTransit.status).toBe("IN_TRANSIT");

    const delivered = await tm.markDelivered(escrow.id, { actor: "HAULER", userId: hauler.id });
    expect(delivered.status).toBe("INSPECTION_PERIOD");
    expect(delivered.inspectionDeadlineAt).toBeDefined();
    const delta = delivered.inspectionDeadlineAt!.getTime() - Date.now();
    expect(delta).toBeGreaterThan(23 * 60 * 60 * 1000);

    const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: escrow.id } });
    expect(entries.length).toBe(1);
    expect(entries[0]!.entryType).toBe("FUNDING");
  });

  it("rejects illegal transitions with typed errors", async () => {
    const escrow = await newEscrow();
    await expect(tm.markInTransit(escrow.id, { actor: "HAULER" })).rejects.toThrowError(
      IllegalTransitionError,
    );
    await expect(tm.fileDispute(escrow.id, { filedByUserId: seller.id, reason: "QUALITY" }, { actor: "SELLER" }))
      .rejects.toThrowError(IllegalTransitionError);
  });

  it("allows the buyer to file a dispute during the inspection window", async () => {
    const escrow = await toInspection(await (await newEscrow()).id);
    const { dispute } = await tm.fileDispute(
      escrow.id,
      { filedByUserId: buyer.id, reason: "WEIGHT_SHRINK", description: "scale ticket shows 2,000 lb short" },
      { actor: "BUYER", userId: buyer.id },
    );
    expect(dispute.status).toBe("OPEN");
    const reloaded = await tm.getEscrow(escrow.id);
    expect(reloaded?.status).toBe("DISPUTED");
    expect(reloaded?.disputeProofDeadlineAt).toBeDefined();
  });

  it("escalates a dispute to arbitration", async () => {
    const escrow = await toInspection(await (await newEscrow()).id);
    const { dispute } = await tm.fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "DAMAGED" }, { actor: "BUYER" });
    const escalated = await tm.submitForArbitration(dispute.id, { actor: "SYSTEM_TIMER" });
    expect(escalated.status).toBe("ARBITRATION_PROCESSING");
    const disputeReloaded = await prisma.automatedDispute.findUnique({ where: { id: dispute.id } });
    expect(disputeReloaded?.status).toBe("ARBITRATION_PROCESSING");
  });

  it("cannot file a second dispute on the same escrow", async () => {
    const escrow = await toInspection(await (await newEscrow()).id);
    await tm.fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "QUALITY" }, { actor: "BUYER" });
    await expect(
      tm.fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "DAMAGED" }, { actor: "BUYER" }),
    ).rejects.toThrowError(IllegalTransitionError);
  });

  it("writes hash-chained audit entries for every transition", async () => {
    const escrow = await newEscrow();
    await tm.fund(escrow.id, { actor: "PLATFORM" });
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "EscrowTransaction", entityId: escrow.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(2);
    // The global hash chain is intact: recomputed hashes match with no gaps.
    expect(await auditLogger.verifyChain()).toEqual([]);
    // Within this escrow's own rows, each row chains to its predecessor.
    for (let i = 1; i < logs.length; i += 1) {
      expect(logs[i]!.prevHash).toBe(logs[i - 1]!.hash);
    }
  });
});

describe("dispute-vs-auto-release race (single winner)", () => {
  it("exactly one of {dispute, auto-release} wins at the deadline instant", async () => {
    const deadline = new Date("2026-08-20T12:00:00.000Z");
    let now = new Date(deadline.getTime() - 24 * 60 * 60 * 1000);
    const clock = () => now;
    const racingTm = new TransactionManager({ clock });

    const escrow = await racingTm.createDraft({
      buyerId: buyer.id,
      sellerId: seller.id,
      haulerId: hauler.id,
      saleAmountCents: 100_000_00,
      contractedWeightLbs: 50_000,
      freightFeeCents: 50_000_00,
      platformFeeBps: 250,
    });
    await racingTm.fund(escrow.id, { actor: "PLATFORM" });
    await racingTm.markInTransit(escrow.id, { actor: "HAULER" });
    await racingTm.markDelivered(escrow.id, { actor: "HAULER" }, { inspectionWindowMs: 24 * 60 * 60 * 1000 });
    now = new Date(deadline.getTime()); // move the clock to the deadline

    const disputeAttempt = racingTm
      .fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "QUALITY" }, { actor: "BUYER" })
      .then(() => "DISPUTE" as const)
      .catch((err) => {
        if (err instanceof IllegalTransitionError) return "TIMER_WON" as const;
        throw err;
      });
    const releaseAttempt = racingTm
      .markSettled(escrow.id, { actor: "SYSTEM_TIMER" })
      .then(() => "TIMER" as const)
      .catch((err) => {
        if (err instanceof IllegalTransitionError) return "DISPUTE_WON" as const;
        throw err;
      });

    const results = await Promise.all([disputeAttempt, releaseAttempt]);

    // Exactly one winner, never both, never neither.
    const winners = results.filter((r) => r === "DISPUTE" || r === "TIMER");
    expect(winners.length).toBe(1);
    const finalState = await racingTm.getEscrow(escrow.id);
    if (winners[0] === "DISPUTE") {
      expect(finalState?.status).toBe("DISPUTED");
      expect(results).toContain("DISPUTE_WON");
    } else {
      expect(finalState?.status).toBe("RESOLVED_DISBURSED");
      expect(results).toContain("TIMER_WON");
    }
  });

  it("re-runs the race 10 times and always produces exactly one winner", async () => {
    for (let i = 0; i < 10; i += 1) {
      const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      let now = new Date(deadline.getTime() - 24 * 60 * 60 * 1000);
      const clock = () => now;
      const racingTm = new TransactionManager({ clock });

      const escrow = await racingTm.createDraft({
        buyerId: buyer.id,
        sellerId: seller.id,
        haulerId: hauler.id,
        saleAmountCents: 100_000_00,
        contractedWeightLbs: 50_000,
        freightFeeCents: 50_000_00,
        platformFeeBps: 250,
      });
      await racingTm.fund(escrow.id, { actor: "PLATFORM" });
      await racingTm.markInTransit(escrow.id, { actor: "HAULER" });
      await racingTm.markDelivered(escrow.id, { actor: "HAULER" }, { inspectionWindowMs: 24 * 60 * 60 * 1000 });
      now = deadline;

      const disputeAttempt = racingTm
        .fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "QUALITY" }, { actor: "BUYER" })
        .then(() => "DISPUTE" as const)
        .catch((err) => {
          if (err instanceof IllegalTransitionError) return "TIMER_WON" as const;
          throw err;
        });
      const releaseAttempt = racingTm
        .markSettled(escrow.id, { actor: "SYSTEM_TIMER" })
        .then(() => "TIMER" as const)
        .catch((err) => {
          if (err instanceof IllegalTransitionError) return "DISPUTE_WON" as const;
          throw err;
        });

      const results = await Promise.all([disputeAttempt, releaseAttempt]);
      const winners = results.filter((r) => r === "DISPUTE" || r === "TIMER");
      expect(winners.length, `iteration ${i}: ${JSON.stringify(results)}`).toBe(1);
    }
  });
  it("records a verdict when the dispute was already escalated (escrow ARBITRATION_PROCESSING)", async () => {
    const escrow = await toInspection(await (await newEscrow()).id);
    const { dispute } = await tm.fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "DAMAGED" }, { actor: "BUYER" });
    await tm.submitForArbitration(dispute.id, { actor: "SYSTEM_TIMER" });

    const result = await resolveArbitration(dispute.id, {
      verdict: "RESOLVED_SPLIT",
      actor: "SYSTEM_ARBITER",
      userId: buyer.id,
    });
    expect(result.dispute.status).toBe("RESOLVED_SPLIT");
    expect(result.dispute.verdict).toBe("RESOLVED_SPLIT");
    expect(result.dispute.settlementVector).toBeDefined();
    const reloaded = await prisma.escrowTransaction.findUnique({ where: { id: escrow.id } });
    expect(reloaded?.status).toBe("ARBITRATION_PROCESSING");
    expect(reloaded?.version).toBeGreaterThan(escrow.version);
  });

  it("escalates and records the verdict directly from DISPUTED in one transaction", async () => {
    const escrow = await toInspection(await (await newEscrow()).id);
    const { dispute } = await tm.fileDispute(escrow.id, { filedByUserId: buyer.id, reason: "QUALITY" }, { actor: "BUYER" });

    const result = await resolveArbitration(dispute.id, {
      verdict: "RESOLVED_SELLER_WINS",
      actor: "SYSTEM_ARBITER",
      userId: buyer.id,
    });
    expect(result.dispute.verdict).toBe("RESOLVED_SELLER_WINS");
    const reloaded = await prisma.escrowTransaction.findUnique({ where: { id: escrow.id } });
    expect(reloaded?.status).toBe("ARBITRATION_PROCESSING");
  });

  describe("financing (deferred payment)", () => {
    it("stamps the payment deadline + financing fee when financing a draft", async () => {
      const escrow = await newEscrow();
      const deadline = new Date(Date.now() + 14 * 24 * 3_600_000);
      const pending = await tm.markPendingPayment(
        escrow.id,
        { actor: "BUYER", userId: buyer.id },
        { paymentDeadlineAt: deadline, financingFeeBps: 100 },
      );
      expect(pending.status).toBe("PENDING_PAYMENT");
      expect(pending.paymentDeadlineAt?.getTime()).toBe(deadline.getTime());
      // 1% of $100,000 sale = $1,000
      expect(pending.financingFeeCents).toBe(100_000_00 / 100);

      // A funded escrow can't be financed again.
      await expect(
        tm.markPendingPayment(escrow.id, { actor: "BUYER" }, { paymentDeadlineAt: deadline, financingFeeBps: 100 }),
      ).rejects.toThrowError(IllegalTransitionError);
    });

    it("posts the financing fee to platform revenue when the escrow is funded", async () => {
      const escrow = await newEscrow();
      const deadline = new Date(Date.now() + 7 * 24 * 3_600_000);
      await tm.markPendingPayment(
        escrow.id,
        { actor: "BUYER", userId: buyer.id },
        { paymentDeadlineAt: deadline, financingFeeBps: 100 },
      );

      const funded = await tm.fund(escrow.id, { actor: "BUYER", userId: buyer.id });
      expect(funded.status).toBe("FUNDED");
      expect(funded.financingFeeCents).toBe(100_000_00 / 100);

      const entries = await prisma.ledgerEntry.findMany({ where: { transactionId: escrow.id } });
      const funding = entries.find((e) => e.entryType === "FUNDING");
      const fee = entries.find((e) => e.entryType === "FINANCING_FEE");
      expect(funding).toBeDefined();
      expect(funding!.amountCents).toBe(100_000_00);
      expect(fee).toBeDefined();
      expect(fee!.amountCents).toBe(100_000_00 / 100);
      const revenue = await prisma.ledgerAccount.findFirst({
        where: { ownerType: "PLATFORM", accountType: "PLATFORM_REVENUE" },
      });
      expect(fee!.creditAccountId).toBe(revenue!.id);
    });

    it("expireUnfunded cancels a pending escrow with a PAYMENT_DEADLINE_MISSED milestone (system timer only)", async () => {
      const escrow = await newEscrow();
      await tm.markPendingPayment(
        escrow.id,
        { actor: "BUYER", userId: buyer.id },
        { paymentDeadlineAt: new Date(Date.now() - 1_000), financingFeeBps: 100 },
      );

      // The system timer (deadline job) expires the escrow with the
      // PAYMENT_DEADLINE_MISSED milestone. (Buyers can also cancel a pending
      // escrow via the normal cancel path — that's the back-out option.)
      const cancelled = await tm.expireUnfunded(escrow.id, { actor: "SYSTEM_TIMER" });
      expect(cancelled.status).toBe("CANCELLED");
      const milestone = await prisma.milestone.findFirst({
        where: { escrowId: escrow.id, kind: "PAYMENT_DEADLINE_MISSED" },
      });
      expect(milestone).toBeDefined();

      // Idempotent: a second expiry is a clean no-op failure.
      await expect(tm.expireUnfunded(escrow.id, { actor: "SYSTEM_TIMER" })).rejects.toThrowError(
        IllegalTransitionError,
      );
    });

    it("funding after the deadline is still allowed while PENDING_PAYMENT (grace on the job side)", async () => {
      const escrow = await newEscrow();
      await tm.markPendingPayment(
        escrow.id,
        { actor: "BUYER", userId: buyer.id },
        { paymentDeadlineAt: new Date(Date.now() - 1_000), financingFeeBps: 100 },
      );
      // The deadline job races the buyer's Pay Now click; whoever locks the
      // row first wins. The buyer funding a split-second late is legitimate.
      const funded = await tm.fund(escrow.id, { actor: "BUYER", userId: buyer.id });
      expect(funded.status).toBe("FUNDED");
    });
  });
});
