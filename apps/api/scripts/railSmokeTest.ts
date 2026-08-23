/**
 * End-to-end rail smoke test: creates a fresh escrow between the seed test
 * users, charges the buyer on the configured REAL rail (Stripe test mode or
 * Dwolla sandbox), delivers, resolves an arbitration, and settles — exercising
 * chargeAndFundEscrow (chargeAndHold), the settlement orchestrator
 * (transferFromFbo per leg), and the ledger throughout.
 *
 * Prereqs:
 *   1. seedTestUsers.ts run (creates test.buyer/seller/hauler)
 *   2. onboardRails.ts --rail <RAIL> run (real wallet refs)
 *   3. .env: PAYMENTS_DRY_RUN=false plus the rail's keys
 *
 * Run from repo root with env loaded:
 *   set -a && source .env && set +a
 *   cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/railSmokeTest.ts [--rail STRIPE|DWOLLA] [--source-ref <ref>]
 *
 * `--source-ref` overrides the buyer payment source; defaults to the buyer's
 * onboarded wallet ref (Dwolla) or the Stripe test card `pm_card_visa`.
 *
 * The 24h inspection window is short-circuited via the dispute/arbitration
 * path so the script finishes in seconds — the same path the integration
 * tests use. ACH (Dwolla) transfers stay PENDING in sandbox until you click
 * "Process bank transfers" in the Dwolla dashboard; the DB state is the
 * assertion here.
 */
import { prisma } from "@livestock/db";
import { resolveArbitration, TransactionManager } from "@livestock/domain";
import { chargeAndFundEscrow, processEscrowSettlement } from "@livestock/payments";

function cliArg(name: string): string | undefined {
  const eqHit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eqHit) return eqHit.split("=").slice(1).join("=");
  const idx = process.argv.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

const RAIL = (
  cliArg("rail") ??
  process.env.PAYMENT_RAIL_DEFAULT ??
  "STRIPE"
) as "STRIPE" | "DWOLLA";
const SOURCE_REF = cliArg("source-ref");

const EMAILS = {
  buyer: "test.buyer@livestock.local",
  seller: "test.seller@livestock.local",
  hauler: "test.hauler@livestock.local",
} as const;

async function main(): Promise<void> {
  if (process.env.PAYMENTS_DRY_RUN === "true") {
    throw new Error("PAYMENTS_DRY_RUN=true in .env — set it to false to exercise the real rails");
  }

  const users: Record<string, { id: string; email: string }> = {};
  for (const role of ["buyer", "seller", "hauler"] as const) {
    const user = await prisma.user.findUnique({ where: { email: EMAILS[role] } });
    if (!user) throw new Error(`${EMAILS[role]} not found — run scripts/seedTestUsers.ts first`);
    users[role] = { id: user.id, email: user.email };
  }

  const wallets = await prisma.ledgerAccount.findMany({
    where: { ownerType: "USER", ownerUserId: { in: [users.buyer.id, users.seller.id, users.hauler.id] }, accountType: "USER_WALLET" },
  });
  const refByOwner = new Map(wallets.map((w) => [w.ownerUserId, w.externalAccountRef ?? ""]));
  for (const role of ["buyer", "seller", "hauler"] as const) {
    const ref = refByOwner.get(users[role].id) ?? "";
    const real = RAIL === "STRIPE" ? ref.startsWith("acct_") && !/acct_(demo|test)_/.test(ref) : ref.startsWith("http");
    if (!real) {
      throw new Error(
        `${role} wallet ref ${ref || "(none)"} is not onboarded on ${RAIL} — run scripts/onboardRails.ts --rail ${RAIL} first`,
      );
    }
  }

  const tm = new TransactionManager();
  const escrow = await tm.createDraft({
    buyerId: users.buyer.id,
    sellerId: users.seller.id,
    haulerId: users.hauler.id,
    // Dwolla sandbox default transaction limit is $5,000 — keep totals under.
    saleAmountCents: 100_000, // $1,000.00 (buyer charge — well under $5k limit)
    contractedWeightLbs: 5_000,
    freightFeeCents: 5_000, // $50.00 (hauler payout)
    platformFeeBps: 250,
  });
  console.log(`Escrow ${escrow.reference} (${escrow.id}) created — rail ${RAIL}`);

  const sourceRef = SOURCE_REF ?? (RAIL === "STRIPE" ? "pm_card_visa" : undefined);
  const charged = await chargeAndFundEscrow(escrow.id, { sourceRef, userId: users.buyer.id });
  console.log(`Buyer charged: rail ref ${charged.railReferenceId} (${charged.status}) -> escrow ${charged.escrow.status}`);

  await tm.markInTransit(escrow.id, { actor: "HAULER", userId: users.hauler.id });
  await tm.markDelivered(escrow.id, { actor: "HAULER", userId: users.hauler.id });
  console.log("Delivered — inspection window open (short-circuited via arbitration)");

  const { dispute } = await tm.fileDispute(
    escrow.id,
    { filedByUserId: users.buyer.id, reason: "WEIGHT_SHRINK", description: "Smoke test dispute" },
    { actor: "BUYER", userId: users.buyer.id },
  );
  await tm.submitForArbitration(dispute.id, { actor: "SYSTEM_TIMER" });
  const { vector } = await resolveArbitration(dispute.id, {
    verdict: "RESOLVED_SPLIT",
    actor: "SYSTEM_ARBITER",
    userId: users.buyer.id,
  });
  console.log(`Arbitration resolved — vector ${JSON.stringify(vector)}`);

  const settled = await processEscrowSettlement(escrow.id, {
    actor: "SYSTEM_ARBITER",
    vector,
    userId: users.buyer.id,
  });
  console.log(`Settlement complete: escrow ${settled.escrow.status}`);

  const intents = await prisma.paymentIntent.findMany({
    where: { escrowId: escrow.id },
    orderBy: { createdAt: "asc" },
  });
  for (const intent of intents) {
    console.log(
      `  ${intent.railOperation.padEnd(9)} ${intent.status.padEnd(9)} ${(intent.amountCents / 100).toFixed(2)} USD  ref=${intent.railReferenceId ?? "-"}`,
    );
  }

  const committed = await prisma.ledgerEntry.findMany({
    where: { transactionId: escrow.id, status: "COMMITTED" },
  });
  const total = committed.reduce((n, e) => n + e.amountCents, 0);
  console.log(`Ledger: ${committed.length} committed entries, zero-sum check: ${total} cents (sale ${escrow.saleAmountCents} cents)`);

  console.log(
    `\nVerify on the ${RAIL === "STRIPE" ? "Stripe dashboard → Developers → Transfers" : "Dwolla sandbox dashboard → Transfers (click \"Process bank transfers\" to clear the ACH legs)"}.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
