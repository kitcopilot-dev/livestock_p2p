import { prisma, type PaymentRail, type UserRole } from "@livestock/db";
import { isDemoMode } from "./auth";
export { isDemoMode };
import { getPlatformSettings } from "./platformSettings";
import { cookies } from "next/headers";

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  kycStatus: string;
}

const DEMO_ROLES: Array<{ role: UserRole; name: string; email: string }> = [
  { role: "BUYER", name: "Dana Buyer", email: "demo.buyer@livestock.local" },
  { role: "SELLER", name: "Sam Seller", email: "demo.seller@livestock.local" },
  { role: "HAULER", name: "Hal Hauler", email: "demo.hauler@livestock.local" },
  { role: "PLATFORM", name: "Ops Console", email: "demo.platform@livestock.local" },
];

const DEMO_ROLE_EMAILS: Record<UserRole, string> = {
  BUYER: "demo.buyer@livestock.local",
  SELLER: "demo.seller@livestock.local",
  HAULER: "demo.hauler@livestock.local",
  PLATFORM: "demo.platform@livestock.local",
};

const ALL_DEMO_ROLES: UserRole[] = ["BUYER", "SELLER", "HAULER", "PLATFORM"];

// Tracks the payout rail used for the last wallet provisioning pass. The demo
// users themselves are NOT cached across calls — they are reconciled against
// the database on every request (see ensureDemoUsers) so that a reseed or a
// DB reset while the server is running can never leave stale ids behind.
let appliedRail: PaymentRail | null = null;

/**
 * Idempotently provisions the demo identity set. Production auth replaces this
 * with the real IdP; the demo switcher exists so every role's viewport can be
 * exercised against the live state machine.
 */
export async function ensureDemoUsers(): Promise<Record<UserRole, DemoUser>> {
  const rail = (await getPlatformSettings()).paymentRail;
  const refFor = (role: UserRole): string =>
    rail === "DWOLLA"
      ? `https://api-sandbox.dwolla.com/funding-sources/demo_${role.toLowerCase()}`
      : `acct_demo_${role.toLowerCase()}`;

  // Reconcile every demo identity against the DB by email on each call instead
  // of trusting a long-lived in-memory id cache. If the database was reset or
  // reseeded while the process stayed up, the rows are re-provisioned with
  // fresh ids, so downstream writes (e.g. setUserRoles) never reference a
  // stale id and fail with P2025.
  const emails = DEMO_ROLES.map((s) => s.email);
  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, role: true, name: true, kycStatus: true },
  });
  const byEmail = new Map(existing.map((u) => [u.email, u]));

  const out = {} as Record<UserRole, DemoUser>;
  const reWallet = appliedRail !== rail;
  for (const spec of DEMO_ROLES) {
    let row = byEmail.get(spec.email);
    let fresh = false;
    if (!row) {
      row = await prisma.user.upsert({
        where: { email: spec.email },
        create: { email: spec.email, name: spec.name, role: spec.role, roles: [spec.role], kycStatus: "APPROVED" },
        update: { role: spec.role, name: spec.name },
      });
      fresh = true;
    } else if (row.role !== spec.role) {
      await prisma.user.update({ where: { id: row.id }, data: { role: spec.role } });
      row.role = spec.role;
    }
    out[spec.role] = { id: row.id, email: row.email, name: spec.name, role: spec.role, kycStatus: row.kycStatus };
    // Provision (or re-point) the internal wallet only when the identity is
    // brand new or the operator flipped the payout rail. Stripe connected
    // accounts are `acct_...`; Dwolla funding sources are resource URLs. The
    // ref format is what selectRailForEscrow validates, so the demo wallet
    // always rides the operator-configured rail.
    if (fresh || reWallet) {
      // Never clobber a real provisioned ref (Stripe `acct_...` connected
      // account or a live Dwolla funding source URL) with the synthetic demo
      // ref. The onboarding script (scripts/onboardRails.ts) owns real refs;
      // a demo-mode page load — or a later demo rail flip — must not orphan
      // them. Only synthetic (`demo_`/`test_`) or missing refs get re-pointed.
      const existingWallet = await prisma.ledgerAccount.findUnique({
        where: {
          ownerType_ownerUserId_accountType: {
            ownerType: "USER",
            ownerUserId: row.id,
            accountType: "USER_WALLET",
          },
        },
        select: { externalAccountRef: true },
      });
      const currentRef = existingWallet?.externalAccountRef ?? "";
      const synthetic = /acct_demo_|funding-sources\/demo_|acct_test_|funding-sources\/test_/.test(currentRef);
      if (synthetic || !currentRef) {
        await prisma.ledgerAccount.upsert({
          where: {
            ownerType_ownerUserId_accountType: {
              ownerType: "USER",
              ownerUserId: row.id,
              accountType: "USER_WALLET",
            },
          },
          create: {
            ownerType: "USER",
            ownerUserId: row.id,
            accountType: "USER_WALLET",
            currency: "USD",
            externalAccountRef: refFor(spec.role),
          },
          update: { externalAccountRef: refFor(spec.role) },
        });
      }
    }
  }
  appliedRail = rail;
  return out;
}

export function demoUserByRole(users: Record<UserRole, DemoUser>, role: UserRole): DemoUser {
  return users[role];
}

/** The demo identity for a specific role, ignoring the active-view cookie. */
export async function getDemoUserForRole(role: UserRole): Promise<DemoUser> {
  const users = await ensureDemoUsers();
  return users[role];
}

export function demoUserForEmail(email: string, users: Record<UserRole, DemoUser>): DemoUser | undefined {
  return Object.values(users).find((u) => u.email === email);
}

/** Reads the active demo user from the cookie (default: BUYER). */
export async function getDemoUser(): Promise<DemoUser> {
  const users = await ensureDemoUsers();
  const cookieStore = await cookies();
  const email = cookieStore.get("demo-user")?.value;
  if (email) {
    const match = demoUserForEmail(email, users);
    if (match) return match;
  }
  return users.BUYER;
}

export async function getDemoRole(): Promise<UserRole> {
  return (await getDemoUser()).role;
}

/**
 * The active role set for viewport gating (navigation + home page). Read from
 * the acting user's persisted `roles` column, so a real multi-role account
 * keeps its unioned nav across reloads (server-side source of truth, not a
 * transient cookie). Falls back to the single primary role when unset.
 */
export async function getDemoRoles(): Promise<UserRole[]> {
  const user = await getDemoUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { roles: true },
  });
  const persisted = (dbUser?.roles ?? []).filter((r) => ALL_DEMO_ROLES.includes(r));
  return persisted.length > 0 ? persisted : [user.role];
}

/**
 * Persists a user's role set and primary role. This is the server-side source
 * of truth for the unioned nav — a real multi-role account keeps its full role
 * set across reloads. The demo-user cookie only selects WHICH user is acting.
 */
export async function setUserRoles(userId: string, roles: UserRole[], primary: UserRole): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { role: primary, roles },
  });
}

export { ALL_DEMO_ROLES };

/** Maps a demo role to the state-machine actor and gating role. */
export function actorForDemoRole(role: UserRole): "BUYER" | "SELLER" | "HAULER" | "PLATFORM" {
  return role;
}

export function demoEmails(): string[] {
  return DEMO_ROLES.map((r) => r.email);
}

export { DEMO_ROLE_EMAILS };

// ---------------------------------------------------------------------------
// Demo speed controls � cookie-driven window overrides
// ---------------------------------------------------------------------------

export type DemoSpeed = "normal" | "fast" | "turbo" | "hyper";

/** Preset windows for each demo speed level. */
export const DEMO_SPEED_PRESETS: Record<DemoSpeed, { inspectionMs: number; disputeMs: number }> = {
  normal: { inspectionMs: 24 * 60 * 60 * 1000, disputeMs: 48 * 60 * 60 * 1000 },
  fast:   { inspectionMs: 60_000,               disputeMs: 120_000 },
  turbo:  { inspectionMs: 30_000,               disputeMs: 60_000 },
  hyper:  { inspectionMs: 10_000,               disputeMs: 20_000 },
};

/** Parse the demo_speed cookie into concrete window milliseconds. */
export function demoWindowsFromCookie(
  cookieStore: { get?: (name: string) => { value: string } | undefined },
): { inspectionWindowMs: number; disputeProofWindowMs: number } {
  const speed = (cookieStore.get?.("demo_speed")?.value ?? "normal") as DemoSpeed;
  const preset = DEMO_SPEED_PRESETS[speed] ?? DEMO_SPEED_PRESETS.normal;
  return {
    inspectionWindowMs: preset.inspectionMs,
    disputeProofWindowMs: preset.disputeMs,
  };
}
