import { prisma, type KycStatus, type User } from "@livestock/db";
import { DomainError } from "@livestock/shared";
import { auditLogger } from "./auditLogger";

/**
 * KYC / AML orchestration. The provider (Persona, Alloy, Stripe Identity,
 * Dwolla verification, ...) is intentionally abstracted: the marketplace gates
 * wallet activation and payout eligibility on APPROVED status and never lets a
 * provider SDK leak into domain code.
 *
 * FinCEN expectations this layer feeds:
 *  - identity verification before money movement
 *  - beneficial-ownership / sanctions screening hooks on enrollment
 *  - transaction monitoring callouts (structuring detection) — see COMPLIANCE.md
 */

export interface KycProvider {
  readonly name: string;
  /** Create a verification session; returns the provider-side session id. */
  startVerification(userId: string): Promise<{ sessionId: string }>;
  /** Poll / ingest a provider webhook result into a KycStatus. */
  ingestResult(sessionId: string, outcome: "approved" | "rejected" | "expired"): Promise<void>;
}

export const kycProvider: KycProvider | null = null; // wired from env in production

export function requireKycApproved(user: Pick<User, "id" | "role" | "kycStatus">): void {
  if (user.kycStatus !== "APPROVED") {
    throw new DomainError(
      "KYC_NOT_APPROVED",
      `${user.role} ${user.id} is not KYC-approved (status: ${user.kycStatus})`,
    );
  }
}

export async function setKycStatus(
  userId: string,
  status: KycStatus,
  actor: { ipAddress?: string } = {},
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { kycStatus: status },
    });
    await auditLogger.write(tx, {
      actorUserId: userId,
      actorRole: user.role,
      action: "KYC_STATUS_CHANGED",
      entityType: "User",
      entityId: userId,
      ipAddress: actor.ipAddress ?? null,
      after: { kycStatus: status },
    });
  });
}

/** True when the user may receive payouts (KYC + active + has rail account). */
export function canReceivePayouts(user: Pick<User, "kycStatus" | "isActive" | "stripeConnectedAccountId" | "dwollaCustomerId">): boolean {
  return user.isActive && user.kycStatus === "APPROVED" && (!!user.stripeConnectedAccountId || !!user.dwollaCustomerId);
}

export function requirePayoutEligible(user: {
  kycStatus: KycStatus;
  isActive: boolean;
  stripeConnectedAccountId: string | null;
  dwollaCustomerId: string | null;
}): void {
  if (!canReceivePayouts(user)) {
    throw new DomainError(
      "PAYOUT_NOT_ELIGIBLE",
      `User is not payout-eligible: kyc=${user.kycStatus} active=${user.isActive}`,
    );
  }
}
