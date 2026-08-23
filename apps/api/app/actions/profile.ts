"use server";

import { prisma } from "@livestock/db";
import { getCurrentUser } from "../../lib/auth";

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
