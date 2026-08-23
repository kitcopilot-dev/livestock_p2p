"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma, type PaymentRail } from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { getDemoUser } from "../../lib/demoAuth";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

function intFrom(formData: FormData, key: string): number | null {
  const raw = formData.get(key)?.toString();
  if (raw === undefined || raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const VALID_RAILS: PaymentRail[] = ["STRIPE", "DWOLLA"];

/**
 * Platform-only settings editor. Validates the money/rail knobs, persists them
 * in a single transaction, and writes a hash-chained audit entry per change so
 * the compliance trail captures who changed platform economics and when.
 */
export async function updatePlatformSettingsAction(formData: FormData): Promise<SettingsActionResult> {
  const user = await getDemoUser();
  if (user.role !== "PLATFORM") {
    return { ok: false, error: "Only the platform operator can edit settings" };
  }

  const platformFeeBps = intFrom(formData, "platformFeeBps");
  const weightTolerancePct = intFrom(formData, "weightTolerancePct");
  const freightFeePct = intFrom(formData, "freightFeePct");
  const paymentRail = formData.get("paymentRail")?.toString() as PaymentRail | undefined;

  if (platformFeeBps === null || platformFeeBps < 0 || platformFeeBps > 10_000) {
    return { ok: false, error: "Platform fee must be 0–10,000 basis points" };
  }
  if (weightTolerancePct === null || weightTolerancePct < 0 || weightTolerancePct > 50) {
    return { ok: false, error: "Weight tolerance must be 0–50%" };
  }
  if (freightFeePct === null || freightFeePct < 0 || freightFeePct > 100) {
    return { ok: false, error: "Freight estimate must be 0–100%" };
  }
  if (!paymentRail || !VALID_RAILS.includes(paymentRail)) {
    return { ok: false, error: "Payment rail must be STRIPE or DWOLLA" };
  }

  const updates: Array<{ key: string; value: string }> = [
    { key: "platformFeeBps", value: String(platformFeeBps) },
    { key: "weightTolerancePct", value: String(weightTolerancePct) },
    { key: "freightFeePct", value: String(freightFeePct) },
    { key: "paymentRail", value: paymentRail },
  ];

  try {
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        const before = await tx.platformSetting.findUnique({ where: { key: u.key } });
        // Only persist + audit values that actually changed, so the trail shows
        // real edits rather than a noisy echo of every form submission.
        if (before && before.value === u.value) continue;
        await tx.platformSetting.upsert({
          where: { key: u.key },
          create: { key: u.key, value: u.value, updatedByUserId: user.id },
          update: { value: u.value, updatedByUserId: user.id },
        });
        await auditLogger.write(tx, {
          actorUserId: user.id,
          actorRole: user.role,
          action: "PLATFORM_SETTING_UPDATED",
          entityType: "PlatformSetting",
          entityId: u.key,
          before: before ? { value: before.value } : Prisma.JsonNull,
          after: { value: u.value },
        });
      }
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath("/settings");
  revalidatePath("/escrows/new");
  return { ok: true };
}

// --- Rail provisioning -------------------------------------------------------

const TEST_USER_EMAILS = [
  { role: "buyer", email: "test.buyer@livestock.local" },
  { role: "seller", email: "test.seller@livestock.local" },
  { role: "hauler", email: "test.hauler@livestock.local" },
] as const;

/** Synthetic refs written by the demo/seed flows — never a real rail account. */
const SYNTHETIC_REF = /acct_demo_|funding-sources\/demo_|acct_test_|funding-sources\/test_/;
const DWOLLA_BASE = "https://api-sandbox.dwolla.com";
const DWOLLA_ACCOUNT_NUMBERS: Record<string, string> = {
  buyer: "123456789",
  seller: "987654321",
  hauler: "555555555",
};
const DWOLLA_SSN: Record<string, string> = {
  buyer: "999001234",
  seller: "999005678",
  hauler: "999009012",
};

export interface RailUserStatus {
  role: string;
  email: string;
  walletRef: string | null;
  stripeConnectedAccountId: string | null;
  dwollaCustomerId: string | null;
  railReady: boolean;
}

/** Fetch rail onboarding status for each test user. */
export async function getRailStatuses(): Promise<RailUserStatus[]> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: "paymentRail" } });
  const rail = (setting?.value === "DWOLLA" ? "DWOLLA" : "STRIPE") as "STRIPE" | "DWOLLA";

  const statuses: RailUserStatus[] = [];
  for (const spec of TEST_USER_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email: spec.email } });
    if (!user) {
      statuses.push({ role: spec.role, email: spec.email, walletRef: null, stripeConnectedAccountId: null, dwollaCustomerId: null, railReady: false });
      continue;
    }
    const wallet = await prisma.ledgerAccount.findUnique({
      where: {
        ownerType_ownerUserId_accountType: {
          ownerType: "USER",
          ownerUserId: user.id,
          accountType: "USER_WALLET",
        },
      },
      select: { externalAccountRef: true },
    });
    const ref = wallet?.externalAccountRef ?? null;
    const railReady = ref !== null && ref.length > 0 && !SYNTHETIC_REF.test(ref) &&
      (rail === "STRIPE" ? ref.startsWith("acct_") : ref.startsWith("http"));
    statuses.push({
      role: spec.role,
      email: spec.email,
      walletRef: ref,
      stripeConnectedAccountId: user.stripeConnectedAccountId,
      dwollaCustomerId: user.dwollaCustomerId,
      railReady,
    });
  }
  return statuses;
}

/** Onboard all test users on the given rail. Platform-only. */
export async function onboardTestUsersAction(formData: FormData): Promise<SettingsActionResult> {
  const user = await getDemoUser();
  if (user.role !== "PLATFORM") {
    return { ok: false, error: "Only the platform operator can onboard test users" };
  }
  const rail = (formData.get("rail")?.toString() ?? "STRIPE") as "STRIPE" | "DWOLLA";
  if (rail !== "STRIPE" && rail !== "DWOLLA") {
    return { ok: false, error: "Rail must be STRIPE or DWOLLA" };
  }

  try {
    if (rail === "STRIPE") {
      const { StripeProvider } = await import("@livestock/payments");
      const stripe = StripeProvider.fromEnv().stripe;
      for (const spec of TEST_USER_EMAILS) {
        const dbUser = await prisma.user.findUnique({ where: { email: spec.email } });
        if (!dbUser) continue;
        const wallet = await prisma.ledgerAccount.findUnique({
          where: {
            ownerType_ownerUserId_accountType: {
              ownerType: "USER",
              ownerUserId: dbUser.id,
              accountType: "USER_WALLET",
            },
          },
          select: { externalAccountRef: true },
        });
        if (wallet?.externalAccountRef && !SYNTHETIC_REF.test(wallet.externalAccountRef) && wallet.externalAccountRef.startsWith("acct_")) continue;
        let accountId = dbUser.stripeConnectedAccountId;
        if (!accountId) {
          const [first_name, ...rest] = (dbUser.name ?? spec.email).split(" ");
          const account = await stripe.accounts.create({
            type: "custom",
            country: "US",
            email: spec.email,
            business_type: "individual",
            individual: { first_name, last_name: rest.join(" ") },
            capabilities: { transfers: { requested: true } },
            tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
            external_account: "tok_ba",
          });
          accountId = account.id;
          await prisma.user.update({ where: { id: dbUser.id }, data: { stripeConnectedAccountId: accountId } });
        }
        await prisma.ledgerAccount.upsert({
          where: {
            ownerType_ownerUserId_accountType: {
              ownerType: "USER",
              ownerUserId: dbUser.id,
              accountType: "USER_WALLET",
            },
          },
          create: { ownerType: "USER", ownerUserId: dbUser.id, accountType: "USER_WALLET", currency: "USD", externalAccountRef: accountId },
          update: { externalAccountRef: accountId },
        });
      }
    } else {
      const { DwollaProvider } = await import("@livestock/payments");
      const client = DwollaProvider.fromEnv().client;
      for (const spec of TEST_USER_EMAILS) {
        const dbUser = await prisma.user.findUnique({ where: { email: spec.email } });
        if (!dbUser) continue;
        const wallet = await prisma.ledgerAccount.findUnique({
          where: {
            ownerType_ownerUserId_accountType: {
              ownerType: "USER",
              ownerUserId: dbUser.id,
              accountType: "USER_WALLET",
            },
          },
          select: { externalAccountRef: true },
        });
        if (wallet?.externalAccountRef && !SYNTHETIC_REF.test(wallet.externalAccountRef) && wallet.externalAccountRef.startsWith("http")) continue;
        let customerUrl: string;
        if (dbUser.dwollaCustomerId) {
          customerUrl = `${DWOLLA_BASE}/customers/${dbUser.dwollaCustomerId}`;
        } else {
          const [firstName, ...rest] = (dbUser.name ?? spec.email).split(" ");
          const res = await client.post("customers", {
            firstName: "verified",
            lastName: rest.join(" ") || firstName,
            email: spec.email,
            type: "personal",
            ipAddress: "127.0.0.1",
            dateOfBirth: "1990-01-01",
            ssn: DWOLLA_SSN[spec.role],
            address1: "123 Test St",
            city: "Des Moines",
            state: "IA",
            postalCode: "50309",
          });
          const location = res.headers.get("location");
          if (!location) throw new Error(`Dwolla did not return a customer location for ${spec.email}`);
          customerUrl = location;
          const customerId = location.split("/").pop() ?? "";
          await prisma.user.update({ where: { id: dbUser.id }, data: { dwollaCustomerId: customerId } });
        }
        const res = await client.post(`${customerUrl}/funding-sources`, {
          routingNumber: "222222226",
          accountNumber: DWOLLA_ACCOUNT_NUMBERS[spec.role],
          bankAccountType: "checking",
          name: `Livestock ${spec.role} checking`,
        });
        const location = res.headers.get("location");
        if (!location) throw new Error(`Dwolla did not return a funding-source location for ${spec.email}`);
        const fsUrl = location;
        await client.post(`${fsUrl}/micro-deposits`);
        await client.post(`${fsUrl}/micro-deposits`, {
          amount1: { value: "0.01", currency: "USD" },
          amount2: { value: "0.02", currency: "USD" },
        });
        await prisma.ledgerAccount.upsert({
          where: {
            ownerType_ownerUserId_accountType: {
              ownerType: "USER",
              ownerUserId: dbUser.id,
              accountType: "USER_WALLET",
            },
          },
          create: { ownerType: "USER", ownerUserId: dbUser.id, accountType: "USER_WALLET", currency: "USD", externalAccountRef: fsUrl },
          update: { externalAccountRef: fsUrl },
        });
      }
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
