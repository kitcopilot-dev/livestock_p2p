import {
  Prisma,
  prisma,
  type LedgerAccount,
  type LedgerEntry,
  type LedgerEntryStatus,
  type LedgerEntryType,
} from "@livestock/db";
import { cents, type Cents } from "@livestock/shared";
import { LedgerError } from "./errors";

/**
 * Double-entry ledger engine.
 *
 * Every LedgerEntry carries exactly one debit account and one credit account
 * with a single positive amount; the database trigger enforces positivity,
 * distinct accounts, and currency consistency. Balances are derived from the
 * COMMITTED entry stream (never stored), so the ledger is immutable by
 * construction: corrections are posted as REVERSAL entries, not UPDATEs.
 *
 * Money-in-motion pattern for external rails:
 *   1. post entries as PENDING inside the same tx that creates PaymentIntents
 *   2. execute the rail transfer (idempotent by key)
 *   3. flip entries to COMMITTED on success, or post REVERSAL entries on
 *      permanent failure (money never silently vanishes)
 */

export interface JournalLeg {
  debitAccountId: string;
  creditAccountId: string;
  amountCents: Cents;
}

export interface PostJournalArgs {
  legs: JournalLeg[];
  entryType: LedgerEntryType;
  transactionId: string | null;
  idempotencyKey: string;
  /** PENDING while the corresponding external rail call is in flight. */
  status?: LedgerEntryStatus;
  description?: string;
}

/** Post a balanced group of entries atomically. Returns the created rows. */
export async function postJournal(
  tx: Prisma.TransactionClient,
  args: PostJournalArgs,
): Promise<LedgerEntry[]> {
  if (args.legs.length === 0) {
    throw new LedgerError("postJournal requires at least one leg");
  }
  for (const leg of args.legs) {
    if (leg.amountCents <= 0) {
      throw new LedgerError("journal leg amount must be positive", { leg });
    }
  }
  const entries: LedgerEntry[] = [];
  for (let i = 0; i < args.legs.length; i += 1) {
    const leg = args.legs[i]!;
    const entry = await tx.ledgerEntry.create({
      data: {
        debitAccountId: leg.debitAccountId,
        creditAccountId: leg.creditAccountId,
        amountCents: leg.amountCents,
        currency: "USD",
        entryType: args.entryType,
        status: args.status ?? "COMMITTED",
        transactionId: args.transactionId,
        idempotencyKey: `${args.idempotencyKey}:${i}`,
        description: args.description,
        committedAt: (args.status ?? "COMMITTED") === "COMMITTED" ? new Date() : null,
      },
    });
    entries.push(entry);
  }
  return entries;
}

/** Single-leg convenience wrapper. */
export async function postEntry(
  tx: Prisma.TransactionClient,
  args: Omit<PostJournalArgs, "legs"> & { leg: JournalLeg },
): Promise<LedgerEntry> {
  const [entry] = await postJournal(tx, { ...args, legs: [args.leg] });
  return entry!;
}

export interface ReverseEntryArgs {
  entryId: string;
  idempotencyKey: string;
  description?: string;
}

/**
 * Reverses a ledger entry by posting a mirror entry (debit/credit swapped)
 * and marking the original REVERSED. Used when a rail transfer permanently
 * fails or a charge is refunded.
 */
export async function reverseEntry(
  tx: Prisma.TransactionClient,
  args: ReverseEntryArgs,
): Promise<LedgerEntry> {
  const original = await tx.ledgerEntry.findUnique({ where: { id: args.entryId } });
  if (!original) {
    throw new LedgerError("cannot reverse unknown ledger entry", { entryId: args.entryId });
  }
  if (original.status === "REVERSED") {
    throw new LedgerError("ledger entry already reversed", { entryId: args.entryId });
  }
  const reversal = await tx.ledgerEntry.create({
    data: {
      debitAccountId: original.creditAccountId,
      creditAccountId: original.debitAccountId,
      amountCents: original.amountCents,
      currency: original.currency,
      entryType: "REVERSAL",
      status: "COMMITTED",
      transactionId: original.transactionId,
      idempotencyKey: args.idempotencyKey,
      description: args.description ?? `Reversal of ${original.id}`,
      reversalOfEntryId: original.id,
      committedAt: new Date(),
    },
  });
  await tx.ledgerEntry.update({
    where: { id: original.id },
    data: { status: "REVERSED" },
  });
  return reversal;
}

/** Mark a PENDING entry COMMITTED after the rail confirmed the transfer. */
export async function commitEntry(
  tx: Prisma.TransactionClient,
  entryId: string,
): Promise<LedgerEntry> {
  const entry = await tx.ledgerEntry.update({
    where: { id: entryId },
    data: { status: "COMMITTED", committedAt: new Date() },
  });
  return entry;
}

/** Mark a PENDING entry FAILED (the rail rejected the transfer). */
export async function failEntry(
  tx: Prisma.TransactionClient,
  entryId: string,
): Promise<LedgerEntry> {
  return tx.ledgerEntry.update({ where: { id: entryId }, data: { status: "FAILED" } });
}

export interface AccountBalance {
  accountId: string;
  balanceCents: Cents;
}

/** Derived balance from the COMMITTED entry stream (see ledger view). */
export async function getBalance(accountId: string): Promise<Cents> {
  const rows = await prisma.$queryRaw<Array<{ balance_cents: bigint | null }>>`
    SELECT balance_cents FROM "LedgerAccountBalance" WHERE account_id = ${accountId}`;
  const row = rows[0];
  if (!row || row.balance_cents === null) return cents(0);
  return cents(Number(row.balance_cents));
}

/** Net escrow held across all PLATFORM_ESCROW accounts. */
export async function getPlatformEscrowBalance(): Promise<Cents> {
  const rows = await prisma.$queryRaw<Array<{ balance_cents: bigint | null }>>`
    SELECT COALESCE(SUM(balance_cents), 0) AS balance_cents
    FROM "LedgerAccountBalance" b
    JOIN "LedgerAccount" a ON a.id = b.account_id
    WHERE a."accountType" = 'PLATFORM_ESCROW' AND a.is_active = true`;
  const row = rows[0];
  return cents(Number(row?.balance_cents ?? 0));
}

export interface LedgerAccountRef {
  accountType: "PLATFORM_ESCROW" | "PLATFORM_REVENUE" | "SUSPENSE" | "USER_WALLET";
  ownerUserId?: string;
  currency?: string;
}

/**
 * Idempotent account resolver: find-or-create the canonical ledger account.
 * Platform accounts are singletons (unique partial index); user wallets are
 * unique per (ownerType, ownerUserId, accountType).
 */
export async function ensureLedgerAccount(
  tx: Prisma.TransactionClient,
  ref: LedgerAccountRef,
): Promise<LedgerAccount> {
  const isUserWallet = ref.accountType === "USER_WALLET";
  const lookup = isUserWallet
    ? (tx: Prisma.TransactionClient) =>
        tx.ledgerAccount.findUnique({
          where: {
            ownerType_ownerUserId_accountType: {
              ownerType: "USER",
              ownerUserId: ref.ownerUserId!,
              accountType: "USER_WALLET",
            },
          },
        })
    : // Platform accounts are singletons via a partial unique index
      // (accountType unique WHERE ownerUserId IS NULL) — a plain findFirst
      // works because only one row can ever exist.
      (tx: Prisma.TransactionClient) =>
        tx.ledgerAccount.findFirst({
          where: { ownerType: "PLATFORM", ownerUserId: null, accountType: ref.accountType },
        });

  const existing = await lookup(tx);
  if (existing) return existing;

  try {
    return await tx.ledgerAccount.create({
      data: {
        ownerType: isUserWallet ? "USER" : "PLATFORM",
        ownerUserId: isUserWallet ? ref.ownerUserId : null,
        accountType: ref.accountType,
        currency: ref.currency ?? "USD",
        externalAccountRef: null,
      },
    });
  } catch (err) {
    // Race: another tx created it first (or the partial unique index fired).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const found = await lookup(tx);
      if (found) return found;
    }
    throw err;
  }
}
