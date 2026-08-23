/**
 * Provision real sandbox accounts on a payment rail for the seed test users
 * (test.buyer / test.seller / test.hauler@livestock.local) so escrow funding
 * and settlement run against Stripe test mode or Dwolla sandbox instead of
 * the dry-run simulator.
 *
 * Requires the rail's keys in `.env` (see PAYMENTS_TESTING.md):
 *   Stripe: STRIPE_SECRET_KEY, STRIPE_PLATFORM_ACCOUNT_ID
 *   Dwolla: DWOLLA_KEY, DWOLLA_SECRET, DWOLLA_PLATFORM_FUNDING_SOURCE_URL
 *
 * Run from repo root with env loaded:
 *   set -a && source .env && set +a
 *   cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/onboardRails.ts [--rail STRIPE|DWOLLA] [--set-rail]
 *
 * Idempotent: users are matched by email, existing rail resources are reused
 * (Stripe connected account via User.stripeConnectedAccountId, Dwolla customer
 * via User.dwollaCustomerId), and a wallet whose ref is already a real rail
 * ref is left untouched. `--set-rail` also flips the platform `paymentRail`
 * setting so settlements select this rail.
 */
import { prisma } from "@livestock/db";
import { DwollaProvider, StripeProvider } from "@livestock/payments";

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
const SET_RAIL = process.argv.includes("--set-rail");

const TEST_USER_SPECS = [
  { role: "buyer", email: "test.buyer@livestock.local" },
  { role: "seller", email: "test.seller@livestock.local" },
  { role: "hauler", email: "test.hauler@livestock.local" },
] as const;

/** Synthetic refs written by the demo/seed flows — never a real rail account. */
const SYNTHETIC_REF = /acct_demo_|funding-sources\/demo_|acct_test_|funding-sources\/test_/;

const DWOLLA_BASE = "https://api-sandbox.dwolla.com";
/** Deterministic per-role Dwolla sandbox bank account numbers (4–17 digits). */
const DWOLLA_ACCOUNT_NUMBERS: Record<string, string> = {
  buyer: "123456789",
  seller: "987654321",
  hauler: "555555555",
};
/** Deterministic per-role sandbox SSN (must differ to avoid collisions). */
const DWOLLA_SSN: Record<string, string> = {
  buyer: "999001234",
  seller: "999005678",
  hauler: "999009012",
};

async function getWalletRef(userId: string): Promise<string> {
  const wallet = await prisma.ledgerAccount.findUnique({
    where: {
      ownerType_ownerUserId_accountType: {
        ownerType: "USER",
        ownerUserId: userId,
        accountType: "USER_WALLET",
      },
    },
    select: { externalAccountRef: true },
  });
  return wallet?.externalAccountRef ?? "";
}

async function setWalletRef(userId: string, ref: string): Promise<void> {
  await prisma.ledgerAccount.upsert({
    where: {
      ownerType_ownerUserId_accountType: {
        ownerType: "USER",
        ownerUserId: userId,
        accountType: "USER_WALLET",
      },
    },
    create: { ownerType: "USER", ownerUserId: userId, accountType: "USER_WALLET", currency: "USD", externalAccountRef: ref },
    update: { externalAccountRef: ref },
  });
}

async function requireTestUsers(): Promise<Record<string, { id: string; name: string | null; email: string }>> {
  const out: Record<string, { id: string; name: string | null; email: string }> = {};
  for (const spec of TEST_USER_SPECS) {
    const user = await prisma.user.findUnique({ where: { email: spec.email } });
    if (!user) {
      throw new Error(
        `user ${spec.email} not found — run scripts/seedTestUsers.ts first (see its header for the invocation)`,
      );
    }
    out[spec.role] = { id: user.id, name: user.name, email: user.email };
  }
  return out;
}

// --- Stripe ---------------------------------------------------------------

async function onboardStripe(users: Record<string, { id: string; name: string | null; email: string }>): Promise<void> {
  // Uses the same env wiring as the runtime provider (also requires
  // STRIPE_WEBHOOK_SECRET — see PAYMENTS_TESTING.md) so the script and the app
  // never drift on key handling.
  const stripe = StripeProvider.fromEnv().stripe;

  for (const spec of TEST_USER_SPECS) {
    const user = users[spec.role];
    const current = await getWalletRef(user.id);
    if (current && !SYNTHETIC_REF.test(current) && current.startsWith("acct_")) {
      console.log(`• ${spec.role.padEnd(6)} already onboarded on Stripe: ${current}`);
      continue;
    }
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const existingAccountId = dbUser?.stripeConnectedAccountId ?? null;
    let accountId: string;
    if (existingAccountId) {
      accountId = existingAccountId;
    } else {
      const [first_name, ...rest] = (user.name ?? spec.email).split(" ");
      // Custom accounts with transfers capability + a test bank account can
      // receive transfers immediately in test mode. The platform account
      // (FBO) never needs its own connected account — it is the transfer
      // destination that receives the buyer's captured funds.
      const account = await stripe.accounts.create({
        type: "custom",
        country: "US",
        email: user.email,
        business_type: "individual",
        individual: { first_name, last_name: rest.join(" ") },
        capabilities: { transfers: { requested: true } },
        tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
        external_account: "tok_ba",
      });
      accountId = account.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeConnectedAccountId: accountId } });
    }
    await setWalletRef(user.id, accountId);
    console.log(`✔ ${spec.role.padEnd(6)} ${user.email} -> Stripe connected account ${accountId}`);
  }
}

// --- Dwolla ---------------------------------------------------------------

async function onboardDwolla(users: Record<string, { id: string; name: string | null; email: string }>): Promise<void> {
  // Uses the same env wiring as the runtime provider (also requires
  // DWOLLA_WEBHOOK_SECRET — see PAYMENTS_TESTING.md) so the script and the
  // app never drift on key handling. DWOLLA_ENV defaults to sandbox.
  const client = DwollaProvider.fromEnv().client;

  for (const spec of TEST_USER_SPECS) {
    const user = users[spec.role];
    const current = await getWalletRef(user.id);
    if (current && !SYNTHETIC_REF.test(current) && current.startsWith("http")) {
      console.log(`• ${spec.role.padEnd(6)} already onboarded on Dwolla: ${current}`);
      continue;
    }

    // 1. Customer — sandbox requires full PII for verified customers.
    //    "verified" as firstName triggers Dwolla's sandbox auto-verification,
    //    but the other fields are mandatory regardless.
    let customerUrl: string;
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (dbUser?.dwollaCustomerId) {
      customerUrl = `${DWOLLA_BASE}/customers/${dbUser.dwollaCustomerId}`;
    } else {
      const [firstName, ...rest] = (user.name ?? spec.email).split(" ");
      let location: string | null = null;
      try {
        const res = await client.post("customers", {
          firstName: "verified",
          lastName: rest.join(" ") || firstName,
          email: user.email,
          type: "personal",
          ipAddress: "127.0.0.1",
          dateOfBirth: "1990-01-01",
          ssn: DWOLLA_SSN[spec.role],
          address1: "123 Test St",
          city: "Des Moines",
          state: "IA",
          postalCode: "50309",
        });
        location = res.headers.get("location");
      } catch (err: unknown) {
        // If the customer already exists in Dwolla (Duplicate error), look it up
        // by email so we can reuse it even if the DB was wiped.
        const body = (err as { body?: { code?: string; _embedded?: { errors?: Array<{ code?: string; _links?: { about?: { href?: string } } }> } } }).body;
        const isDuplicate =
          body?.code === "Duplicate" ||
          body?._embedded?.errors?.some((e) => e.code === "Duplicate");
        if (isDuplicate) {
          const aboutHref =
            body?._embedded?.errors?.find((e) => e.code === "Duplicate")?._links?.about?.href;
          if (aboutHref) location = aboutHref;
        }
        if (!location) throw err;
      }
      if (!location) throw new Error(`Dwolla did not return a customer location header for ${user.email}`);
      customerUrl = location;
      const customerId = location.split("/").pop() ?? "";
      await prisma.user.update({ where: { id: user.id }, data: { dwollaCustomerId: customerId } });
    }

    // 2. Funding source with Dwolla's sandbox test bank, then verify via
    //    micro-deposits. In sandbox any two amounts under $0.10 verify
    //    immediately, so the whole dance completes in one script run.
    let fsUrl: string;
    try {
      const res = await client.post(`${customerUrl}/funding-sources`, {
        routingNumber: "222222226",
        accountNumber: DWOLLA_ACCOUNT_NUMBERS[spec.role],
        bankAccountType: "checking",
        name: `Livestock ${spec.role} checking`,
      });
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Dwolla did not return a funding-source location header for ${user.email}`);
      fsUrl = loc;
    } catch (err: unknown) {
      // If the funding source already exists, reuse it.
      const body = (err as { body?: { code?: string; _links?: { about?: { href?: string } } } }).body;
      if (body?.code === "DuplicateResource" && body._links?.about?.href) {
        fsUrl = body._links.about.href;
      } else {
        throw err;
      }
    }
    // Micro-deposits: initiate then verify. If the resource returns 404, the
    // funding source was already verified in a prior run — move on.
    try {
      await client.post(`${fsUrl}/micro-deposits`);
      await client.post(`${fsUrl}/micro-deposits`, {
        amount1: { value: "0.01", currency: "USD" },
        amount2: { value: "0.02", currency: "USD" },
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status !== 404) throw err;
      // 404 = already verified in a prior run.
    }

    await setWalletRef(user.id, fsUrl);
    console.log(`✔ ${spec.role.padEnd(6)} ${user.email} -> funding source ${fsUrl}`);
  }
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const users = await requireTestUsers();

  if (RAIL === "STRIPE") {
    await onboardStripe(users);
  } else if (RAIL === "DWOLLA") {
    await onboardDwolla(users);
  } else {
    throw new Error(`unknown rail ${RAIL} — use STRIPE or DWOLLA`);
  }

  if (SET_RAIL) {
    await prisma.platformSetting.upsert({
      where: { key: "paymentRail" },
      create: { key: "paymentRail", value: RAIL, description: "Default payout rail for settlements (STRIPE or DWOLLA)." },
      update: { value: RAIL },
    });
    console.log(`✔ Platform paymentRail setting -> ${RAIL}`);
  } else {
    const setting = await prisma.platformSetting.findUnique({ where: { key: "paymentRail" } });
    console.log(`\nPlatform paymentRail is ${setting?.value ?? "unset (defaults to STRIPE)"}.`);
    console.log(`Re-run with --set-rail to flip it to ${RAIL} so settlements select this rail.`);
  }

  await prisma.$disconnect();
  console.log("\nOnboarding complete. Next: run scripts/railSmokeTest.ts to exercise a full escrow charge + settle.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
