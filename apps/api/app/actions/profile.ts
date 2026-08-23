"use server";

import { prisma } from "@livestock/db";
import { getCurrentUser, isDemoMode } from "../../lib/auth";
import { StripeProvider } from "@livestock/payments";

export async function getProfile(): Promise<{
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  businessName: string | null;
  dotNumber: string | null;
  einTaxId: string | null;
  role: string;
  kycStatus: string;
  image: string | null;
  stripeConnectedAccountId: string | null;
  dwollaCustomerId: string | null;
} | null> {
  const current = await getCurrentUser();
  if (!current) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: current.id },
    select: {
      id: true, name: true, email: true, phone: true, businessName: true,
      dotNumber: true, einTaxId: true, role: true, kycStatus: true,
      image: true, stripeConnectedAccountId: true, dwollaCustomerId: true,
    },
  });
  return dbUser;
}

export async function updateProfile(data: {
  name?: string;
  phone?: string;
  businessName?: string;
  dotNumber?: string;
  einTaxId?: string;
}): Promise<{ ok: true } | { error: string }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Not authenticated" };

  await prisma.user.update({
    where: { id: current.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.businessName !== undefined && { businessName: data.businessName }),
      ...(data.dotNumber !== undefined && { dotNumber: data.dotNumber }),
      ...(data.einTaxId !== undefined && { einTaxId: data.einTaxId }),
    },
  });
  return { ok: true };
}

/**
 * Initiate Stripe Connect onboarding for the current user.
 * Creates a connected account if needed, then returns a URL to Stripe's
 * hosted onboarding page.
 */
export async function connectStripe(): Promise<{ url: string } | { error: string }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Not authenticated" };

  if (isDemoMode()) return { error: "Stripe connection is not available in demo mode" };

  try {
    const provider = StripeProvider.fromEnv();
    const user = await prisma.user.findUnique({ where: { id: current.id } });
    if (!user) return { error: "User not found" };

    // Reuse existing connected account if present
    let accountId = user.stripeConnectedAccountId;
    if (!accountId) {
      const [firstName, ...rest] = (user.name ?? user.email).split(" ");
      accountId = await provider.createConnectedAccount({
        email: user.email,
        firstName,
        lastName: rest.join(" ") || firstName,
      });
      await prisma.user.update({ where: { id: user.id }, data: { stripeConnectedAccountId: accountId } });
    }

    // Generate onboarding link
    const baseUrl = process.env.NEXTAUTH_URL || "https://livestock-p2p.exe.xyz";
    const url = await provider.createAccountLink(accountId, {
      refreshUrl: `${baseUrl}/profile?stripe=refresh`,
      returnUrl: `${baseUrl}/api/stripe/callback`,
    });

    return { url };
  } catch (err) {
    console.error("[stripe-connect] failed:", err);
    return { error: (err as Error).message };
  }
}

/**
 * Check Stripe onboarding status for the current user.
 */
export async function getStripeStatus(): Promise<{
  connected: boolean;
  isComplete: boolean;
  currentlyDue?: string[];
  errors?: string[];
}> {
  const current = await getCurrentUser();
  if (!current) return { connected: false, isComplete: false };

  const user = await prisma.user.findUnique({ where: { id: current.id } });
  if (!user?.stripeConnectedAccountId) return { connected: false, isComplete: false };

  if (isDemoMode()) return { connected: true, isComplete: true };

  try {
    const provider = StripeProvider.fromEnv();
    const status = await provider.getOnboardingStatus(user.stripeConnectedAccountId);
    return { connected: true, ...status };
  } catch (err) {
    console.error("[stripe-status] failed:", err);
    return { connected: true, isComplete: false };
  }
}
