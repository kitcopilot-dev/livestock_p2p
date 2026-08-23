import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livestock/db";
import { seedUser, truncateAll } from "@livestock/db/testing";
import { cents } from "@livestock/shared";
import { ensureLedgerAccount, getBalance, postEntry, postJournal, reverseEntry } from "../src/ledger";

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function walletFor(userId: string, currency = "USD") {
  return ensureLedgerAccount(prisma, { accountType: "USER_WALLET", ownerUserId: userId, currency });
}

describe("double-entry ledger (PostgreSQL enforcement)", () => {
  it("posts a journal and derives balances from the entry stream", async () => {
    const buyer = await seedUser({ role: "BUYER" });
    const seller = await seedUser({ role: "SELLER" });
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    const buyerWallet = await walletFor(buyer.id);
    const sellerWallet = await walletFor(seller.id);

    await prisma.$transaction(async (tx) => {
      // Buyer funds the escrow: buyer wallet down, escrow up.
      await postEntry(tx, {
        leg: { debitAccountId: buyerWallet.id, creditAccountId: escrow.id, amountCents: cents(100_000_00) },
        entryType: "FUNDING",
        transactionId: "esc-1",
        idempotencyKey: "t:esc-1:fund",
      });
      // Settlement: escrow down, seller up, platform revenue up.
      const revenue = await ensureLedgerAccount(tx, { accountType: "PLATFORM_REVENUE" });
      await postJournal(tx, {
        legs: [
          { debitAccountId: escrow.id, creditAccountId: sellerWallet.id, amountCents: cents(97_500_00) },
          { debitAccountId: escrow.id, creditAccountId: revenue.id, amountCents: cents(2_500_00) },
        ],
        entryType: "SETTLEMENT",
        transactionId: "esc-1",
        idempotencyKey: "t:esc-1:settle",
      });
    });

    // escrow: +100k (funding) - 97.5k - 2.5k (settlement) = 0
    expect(await getBalance(escrow.id)).toBe(cents(0));
    // seller received 97.5k
    expect(await getBalance(sellerWallet.id)).toBe(cents(97_500_00));
    // buyer funded 100k, received nothing back -> -100k
    expect(await getBalance(buyerWallet.id)).toBe(cents(-100_000_00));

    // Global zero-sum property: every account's balances sum to zero.
    const balances = await prisma.$queryRaw<Array<{ balance_cents: bigint }>>`
      SELECT balance_cents FROM "LedgerAccountBalance"`;
    const total = balances.reduce((sum, row) => sum + Number(row.balance_cents), 0);
    expect(total).toBe(0);
  });

  it("rejects a non-positive amount via the database trigger", async () => {
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    const user = await seedUser({ role: "BUYER" });
    const wallet = await walletFor(user.id);
    await expect(
      prisma.ledgerEntry.create({
        data: {
          debitAccountId: escrow.id,
          creditAccountId: wallet.id,
          amountCents: -5,
          currency: "USD",
          entryType: "ADJUSTMENT",
          idempotencyKey: `neg:${Date.now()}`,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a self-transfer via the database trigger", async () => {
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    await expect(
      prisma.ledgerEntry.create({
        data: {
          debitAccountId: escrow.id,
          creditAccountId: escrow.id,
          amountCents: 100,
          currency: "USD",
          entryType: "ADJUSTMENT",
          idempotencyKey: `self:${Date.now()}`,
        },
      }),
    ).rejects.toThrow(/must differ/);
  });

  it("rejects a currency mismatch via the database trigger", async () => {
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    const user = await seedUser({ role: "BUYER" });
    const wallet = await walletFor(user.id, "EUR");
    await expect(
      prisma.ledgerEntry.create({
        data: {
          debitAccountId: escrow.id,
          creditAccountId: wallet.id,
          amountCents: 100,
          currency: "USD",
          entryType: "ADJUSTMENT",
          idempotencyKey: `ccy:${Date.now()}`,
        },
      }),
    ).rejects.toThrow(/currency mismatch/);
  });

  it("enforces unique idempotency keys", async () => {
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    const user = await seedUser({ role: "BUYER" });
    const wallet = await walletFor(user.id);
    const data = {
      debitAccountId: escrow.id,
      creditAccountId: wallet.id,
      amountCents: 100,
      currency: "USD",
      entryType: "ADJUSTMENT" as const,
      idempotencyKey: "idem:fixed",
    };
    await prisma.ledgerEntry.create({ data });
    await expect(prisma.ledgerEntry.create({ data })).rejects.toThrow();
  });

  it("excludes PENDING entries from balances until committed", async () => {
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    const user = await seedUser({ role: "SELLER" });
    const wallet = await walletFor(user.id);
    const before = await getBalance(escrow.id);

    const entry = await prisma.$transaction(async (tx) =>
      postEntry(tx, {
        leg: { debitAccountId: escrow.id, creditAccountId: wallet.id, amountCents: cents(500_00) },
        entryType: "SETTLEMENT",
        transactionId: "esc-pending",
        idempotencyKey: "pending:1",
        status: "PENDING",
      }),
    );
    expect(await getBalance(escrow.id)).toBe(before); // PENDING: no balance effect

    await prisma.$transaction((tx) =>
      tx.ledgerEntry.update({ where: { id: entry.id }, data: { status: "COMMITTED", committedAt: new Date() } }),
    );
    expect(await getBalance(escrow.id)).toBe(cents(before - 500_00)); // now visible
  });

  it("reverses a committed entry and restores the balance", async () => {
    const escrow = await ensureLedgerAccount(prisma, { accountType: "PLATFORM_ESCROW" });
    const user = await seedUser({ role: "SELLER" });
    const wallet = await walletFor(user.id);
    const escrowBefore = await getBalance(escrow.id);
    const walletBefore = await getBalance(wallet.id);

    const entry = await prisma.$transaction((tx) =>
      postEntry(tx, {
        leg: { debitAccountId: escrow.id, creditAccountId: wallet.id, amountCents: cents(777_00) },
        entryType: "SETTLEMENT",
        transactionId: "esc-rev",
        idempotencyKey: "rev:orig",
      }),
    );
    expect(await getBalance(escrow.id)).toBe(cents(escrowBefore - 777_00));
    expect(await getBalance(wallet.id)).toBe(cents(walletBefore + 777_00));

    await prisma.$transaction((tx) =>
      reverseEntry(tx, { entryId: entry.id, idempotencyKey: "rev:reversal" }),
    );

    const reverted = await prisma.ledgerEntry.findUnique({ where: { id: entry.id } });
    expect(reverted?.status).toBe("REVERSED");
    // Mirror entry cancelled the original's effect: balances restored.
    expect(await getBalance(escrow.id)).toBe(escrowBefore);
    expect(await getBalance(wallet.id)).toBe(walletBefore);
  });
});
