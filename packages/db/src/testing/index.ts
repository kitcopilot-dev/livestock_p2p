import { prisma } from "../client";
import type { UserRole } from "../generated/prisma/client";

/**
 * Test helpers for integration tests. They talk to the real Postgres instance
 * (docker-compose) and reset state between suites.
 */

/** Truncates every table (FK-safe order) and resets sequences. */
export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "IdempotencyRecord",
      "ScheduleReceipt",
      "PaymentIntent",
      "AuditLog",
      "Evidence",
      "Milestone",
      "AutomatedDispute",
      "LedgerEntry",
      "EscrowTransaction",
      "LedgerAccount",
      "PasswordResetToken",
      "MagicLink",
      "User"
    RESTART IDENTITY CASCADE;
    SELECT setval('escrow_reference_seq', 1, false);
  `);
}

export async function seedUser(overrides: {
  role: UserRole;
  email?: string;
  kycStatus?: "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  stripeConnectedAccountId?: string | null;
  dwollaCustomerId?: string | null;
}): Promise<{ id: string; email: string }> {
  const email = overrides.email ?? `${overrides.role.toLowerCase()}-${crypto.randomUUID()}@test.local`;
  return prisma.user.create({
    data: {
      email,
      role: overrides.role,
      kycStatus: overrides.kycStatus ?? "APPROVED",
      stripeConnectedAccountId: overrides.stripeConnectedAccountId ?? null,
      dwollaCustomerId: overrides.dwollaCustomerId ?? null,
    },
    select: { id: true, email: true },
  });
}

/** Seeds a party (user + wallet with a rail destination) for settlement tests. */
export async function seedParty(role: UserRole, railAccount: string): Promise<{ id: string; email: string }> {
  const user = await seedUser({ role, stripeConnectedAccountId: railAccount });
  await prisma.ledgerAccount.create({
    data: {
      ownerType: "USER",
      ownerUserId: user.id,
      accountType: "USER_WALLET",
      currency: "USD",
      externalAccountRef: railAccount,
    },
  });
  return user;
}

export interface EscrowSeedInput {
  buyerId: string;
  sellerId: string;
  haulerId: string;
  saleAmountCents?: number;
  contractedWeightLbs?: number;
  weightTolerancePct?: number;
  freightFeeCents?: number;
  platformFeeBps?: number;
  status?: "DRAFT";
}

export async function seedEscrow(input: EscrowSeedInput): Promise<{ id: string }> {
  const saleAmountCents = input.saleAmountCents ?? 100_000_00; // $100,000.00
  const contractedWeightLbs = input.contractedWeightLbs ?? 50_000;
  const pricePerLbMicros = Math.round((saleAmountCents * 1_000_000) / contractedWeightLbs);
  const escrow = await prisma.escrowTransaction.create({
    data: {
      reference: `TEST-ESC-${crypto.randomUUID().slice(0, 8)}`,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      haulerId: input.haulerId,
      status: "DRAFT",
      saleAmountCents,
      contractedWeightLbs,
      weightTolerancePct: input.weightTolerancePct ?? 2,
      pricePerLbMicros,
      freightFeeCents: input.freightFeeCents ?? 50_000_00, // $5,000.00
      platformFeeBps: input.platformFeeBps ?? 250, // 2.5%
    },
    select: { id: true },
  });
  return escrow;
}
