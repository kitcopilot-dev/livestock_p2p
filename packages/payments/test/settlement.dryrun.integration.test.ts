import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livestock/db";
import { seedParty, truncateAll } from "@livestock/db/testing";
import { IllegalTransitionError, resolveArbitration, TransactionManager } from "@livestock/domain";
import { processEscrowSettlement } from "../src/settlement";

let tm: TransactionManager;
let buyer: { id: string };
let seller: { id: string };
let hauler: { id: string };

beforeAll(async () => {
  await truncateAll();
  buyer = await seedParty("BUYER", "acct_dry_buyer");
  seller = await seedParty("SELLER", "acct_dry_seller");
  hauler = await seedParty("HAULER", "acct_dry_hauler");
  tm = new TransactionManager();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function toArbitratedEscrow() {
  const draft = await tm.createDraft({
    buyerId: buyer.id,
    sellerId: seller.id,
    haulerId: hauler.id,
    saleAmountCents: 100_000_00,
    contractedWeightLbs: 50_000,
    freightFeeCents: 150_000, // $1,500.00
    platformFeeBps: 250,
  });
  await tm.fund(draft.id, { actor: "PLATFORM" });
  await tm.markInTransit(draft.id, { actor: "HAULER", userId: hauler.id });
  const escrow = await tm.markDelivered(draft.id, { actor: "HAULER", userId: hauler.id });
  const { dispute } = await tm.fileDispute(
    escrow.id,
    { filedByUserId: buyer.id, reason: "WEIGHT_SHRINK", description: "2,000 lb short on scale" },
    { actor: "BUYER", userId: buyer.id },
  );
  await tm.submitForArbitration(dispute.id, { actor: "SYSTEM_TIMER" });
  return { escrow, dispute };
}

describe("dry-run settlement (PAYMENTS_DRY_RUN=true)", () => {
  it("settles an arbitrated escrow to RESOLVED_DISBURSED with committed ledger entries", async () => {
    const { escrow, dispute } = await toArbitratedEscrow();
    const { vector } = await resolveArbitration(dispute.id, {
      verdict: "RESOLVED_SPLIT",
      actor: "SYSTEM_ARBITER",
      userId: buyer.id,
    });

    const result = await processEscrowSettlement(escrow.id, {
      actor: "SYSTEM_ARBITER",
      vector,
      userId: buyer.id,
    });

    expect(result.escrow.status).toBe("RESOLVED_DISBURSED");
    expect(result.escrow.settlementAt).toBeDefined();

    const intents = await prisma.paymentIntent.findMany({ where: { escrowId: escrow.id } });
    expect(intents.length).toBeGreaterThanOrEqual(3); // seller + hauler + buyer refund
    for (const intent of intents) {
      expect(intent.status).toBe("SUCCEEDED");
      expect(intent.railReferenceId).toMatch(/^dry_tr_/);
    }

    // Every rail leg plus the internal platform-fee posting is committed.
    const committed = await prisma.ledgerEntry.findMany({
      where: { transactionId: escrow.id, status: "COMMITTED", entryType: "SETTLEMENT" },
    });
    expect(committed.length).toBe(intents.length + 1); // + 1 internal revenue leg
    // Zero-sum: debits out of escrow equal credits into wallets/revenue.
    const total = committed.reduce((n, e) => n + e.amountCents, 0);
    expect(total).toBe(escrow.saleAmountCents);
    const revenue = await prisma.ledgerEntry.findFirst({
      where: { transactionId: escrow.id, idempotencyKey: `settle:${escrow.id}:revenue` },
    });
    expect(revenue?.status).toBe("COMMITTED");

    const released = await prisma.milestone.findFirst({
      where: { escrowId: escrow.id, kind: "RELEASED" },
    });
    expect(released).toBeDefined();
  });

  it("does not double-settle: a second settlement call on a terminal escrow is rejected and adds nothing", async () => {
    const { escrow, dispute } = await toArbitratedEscrow();
    const { vector } = await resolveArbitration(dispute.id, {
      verdict: "RESOLVED_SELLER_WINS",
      actor: "SYSTEM_ARBITER",
    });
    await processEscrowSettlement(escrow.id, { actor: "SYSTEM_ARBITER", vector });

    const intentCount = await prisma.paymentIntent.count({ where: { escrowId: escrow.id } });
    const entryCount = await prisma.ledgerEntry.count({ where: { transactionId: escrow.id } });

    await expect(
      processEscrowSettlement(escrow.id, { actor: "SYSTEM_ARBITER", vector }),
    ).rejects.toThrowError(IllegalTransitionError);

    const intentCountAfter = await prisma.paymentIntent.count({ where: { escrowId: escrow.id } });
    const entryCountAfter = await prisma.ledgerEntry.count({ where: { transactionId: escrow.id } });
    expect(intentCountAfter).toBe(intentCount);
    expect(entryCountAfter).toBe(entryCount);
  });
});
