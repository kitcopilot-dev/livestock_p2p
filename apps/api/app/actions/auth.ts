"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma, type UserRole } from "@livestock/db";
import { getEmailProvider } from "../../lib/email";
import { isDemoMode, getAuthMethod, signIn, signOut } from "../../lib/auth";

// ---------------------------------------------------------------------------
// Password registration
// ---------------------------------------------------------------------------

export async function registerWithEmail(
  email: string,
  password: string,
  name: string,
  role: UserRole,
): Promise<{ ok: true } | { error: string }> {
  if (isDemoMode()) return { error: "Registration is disabled in demo mode" };
  if (getAuthMethod() !== "password") return { error: "Registration not available for current auth method" };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with this email already exists" };

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      roles: [role],
      passwordHash,
      accounts: {
        create: { type: "credentials", provider: "credentials", providerAccountId: email },
      },
    },
  });

  // Provision wallet
  const rail = process.env.PAYMENT_RAIL ?? "STRIPE";
  const refFor = `acct_${role.toLowerCase()}_${user.id.slice(0, 8)}`;
  await prisma.ledgerAccount.create({
    data: {
      ownerType: "USER",
      ownerUserId: user.id,
      accountType: "USER_WALLET",
      currency: "USD",
      externalAccountRef: refFor,
    },
  });

  // Sign in
  await signIn("credentials", {
    email,
    password,
    redirectTo: "/onboarding",
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Magic link
// ---------------------------------------------------------------------------

export async function requestMagicLink(
  email: string,
  role?: UserRole,
): Promise<{ ok: true } | { error: string }> {
  if (isDemoMode()) return { error: "Magic links disabled in demo mode" };
  if (getAuthMethod() !== "magic_link") return { error: "Magic links not available for current auth method" };

  const token = crypto.randomBytes(32).toString("hex");
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  await prisma.magicLink.create({
    data: {
      email,
      token,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    },
  });

  // Send email
  const provider = getEmailProvider();
  await provider.sendMagicLink(email, token, baseUrl);

  // Store role hint in a cookie so verify page can assign it
  if (role) {
    const cookieStore = await cookies();
    cookieStore.set("pending_role", role, { path: "/", httpOnly: true, maxAge: 60 * 60 });
  }

  return { ok: true };
}

export async function verifyMagicLinkToken(
  token: string,
): Promise<{ ok: true; redirect: string } | { error: string }> {
  if (isDemoMode()) return { error: "Magic links disabled in demo mode" };

  const record = await prisma.magicLink.findUnique({ where: { token } });
  if (!record) return { error: "Invalid or expired link" };
  if (record.usedAt) return { error: "This link has already been used" };
  if (record.expiresAt < new Date()) return { error: "This link has expired" };

  // Mark as used
  await prisma.magicLink.update({ where: { token }, data: { usedAt: new Date() } });

  // Read pending role from cookie
  const cookieStore = await cookies();
  const pendingRole = (cookieStore.get("pending_role")?.value ?? "BUYER") as UserRole;

  // Upsert user
  const user = await prisma.user.upsert({
    where: { email: record.email },
    create: {
      email: record.email,
      name: record.email.split("@")[0],
      role: pendingRole,
      roles: [pendingRole],
      accounts: {
        create: { type: "magic_link", provider: "magic_link", providerAccountId: token },
      },
    },
    update: {},
  });

  // Provision wallet if new
  const wallet = await prisma.ledgerAccount.findUnique({
    where: {
      ownerType_ownerUserId_accountType: {
        ownerType: "USER",
        ownerUserId: user.id,
        accountType: "USER_WALLET",
      },
    },
  });
  if (!wallet) {
    const refFor = `acct_${pendingRole.toLowerCase()}_${user.id.slice(0, 8)}`;
    await prisma.ledgerAccount.create({
      data: {
        ownerType: "USER",
        ownerUserId: user.id,
        accountType: "USER_WALLET",
        currency: "USD",
        externalAccountRef: refFor,
      },
    });
  }

  // Set the onboarded cookie so the middleware allows access
  if (user.onboardingCompletedAt) {
    cookieStore.set("onboarded", "1", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }

  // Determine redirect target
  const redirectTo = user.onboardingCompletedAt ? "/" : "/onboarding";

  // Note: signIn() cannot be called from a server component after the token
  // is already marked used. The verify page will handle the redirect.
  return { ok: true, redirect: redirectTo };
}

// ---------------------------------------------------------------------------
// Onboarding completion
// ---------------------------------------------------------------------------

export async function completeOnboarding(data: {
  name?: string;
  phone?: string;
  businessName?: string;
  dotNumber?: string;
  einTaxId?: string;
}): Promise<{ ok: true } | { error: string }> {
  if (isDemoMode()) return { error: "Onboarding not available in demo mode" };

  const session = await (await import("../../lib/auth")).getSession();
  const userId = (session as any)?.user?.id;
  if (!userId) return { error: "Not authenticated" };

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      phone: data.phone,
      businessName: data.businessName,
      dotNumber: data.dotNumber,
      einTaxId: data.einTaxId,
      onboardingCompletedAt: new Date(),
    },
  });

  // Set the onboarded cookie so the middleware stops redirecting to /onboarding
  const cookieStore = await cookies();
  cookieStore.set("onboarded", "1", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Login completion — called after a successful client-side signIn() so the
// middleware's `onboarded` gate reflects the DB state and the user is
// redirected to their role-aware home.
// ---------------------------------------------------------------------------

export async function finishPasswordLogin(): Promise<{ redirect: string }> {
  const session = await (await import("../../lib/auth")).getSession();
  const userId = (session as any)?.user?.id;
  if (!userId) return { redirect: "/login" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });

  if (user?.onboardingCompletedAt) {
    const cookieStore = await cookies();
    cookieStore.set("onboarded", "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return { redirect: "/" };
  }
  return { redirect: "/onboarding" };
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout() {
  if (isDemoMode()) {
    const cookieStore = await cookies();
    cookieStore.delete("demo-user");
    cookieStore.delete("demo-roles");
    redirect("/login");
  }
  await signOut({ redirectTo: "/login" });
}
