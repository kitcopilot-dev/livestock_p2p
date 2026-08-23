import {
  Prisma,
  prisma,
  type AutomatedDispute,
  type DisputeStatus as DbDisputeStatus,
  type EscrowTransaction,
  type Evidence,
  type EvidenceFileType,
  type EvidenceSource,
} from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { cents } from "@livestock/shared";
import { DisputeNotFoundError, EscrowNotFoundError, ValidationError } from "./errors";
import { getBalance } from "./ledger";
import { computeDisputeVector, computeSettlementBreakdown, type DisputeVerdict, type SettlementVector } from "./splits";
import { assertTransition, type EscrowActor } from "./stateMachine";

import { runEscrowTransaction } from "./transactionManager";
import type { AddEvidenceInput } from "./schemas";

/**
 * Upload a piece of evidence. The SHA-256 is stored at ingest and re-checked
 * against object storage before adjudication (see compliance/mediaHash).
 */
export async function addEvidence(input: AddEvidenceInput): Promise<Evidence> {
  return runEscrowTransaction(async (tx) => {
    const dispute = await tx.automatedDispute.findUnique({ where: { id: input.disputeId } });
    if (!dispute) throw new DisputeNotFoundError(input.disputeId);
    if (dispute.escrowId !== input.escrowId) {
      throw new ValidationError("evidence escrow does not match dispute escrow");
    }
    const evidence = await tx.evidence.create({
      data: {
        disputeId: input.disputeId,
        escrowId: input.escrowId,
        uploaderId: input.uploaderId,
        source: input.source,
        fileType: input.fileType,
        storageUri: input.storageUri,
        fileSha256: input.fileSha256,
        metadata: (input.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
    await auditLogger.write(tx, {
      actorUserId: input.uploaderId,
      actorRole: "PARTY",
      action: "EVIDENCE_UPLOADED",
      entityType: "Evidence",
      entityId: evidence.id,
      after: { disputeId: input.disputeId, source: input.source, fileSha256: input.fileSha256 },
    });
    return evidence;
  });
}

export type EvidenceVerificationFlag =
  | "isVetCertified"
  | "isScaleTicketVerified"
  | "scaleNetWeightLbs"
  | "isTruepicVerified";

/**
 * Applies verified metadata flags to an Evidence row. The route handler MUST
 * verify the provider-signed payload first (compliance.acceptVerifiedClaim);
 * this function only persists already-trusted flags.
 */
export async function markEvidenceVerified(
  evidenceId: string,
  flags: Partial<
    Record<EvidenceVerificationFlag, boolean | number> & { truepicMetadata?: Record<string, unknown> }
  >,
): Promise<Evidence> {
  return runEscrowTransaction(async (tx) => {
    const evidence = await tx.evidence.findUnique({ where: { id: evidenceId } });
    if (!evidence) {
      throw new ValidationError(`evidence ${evidenceId} not found`);
    }
    const updated = await tx.evidence.update({
      where: { id: evidenceId },
      data: {
        isVetCertified:
          typeof flags.isVetCertified === "boolean" ? flags.isVetCertified : evidence.isVetCertified,
        isScaleTicketVerified:
          typeof flags.isScaleTicketVerified === "boolean"
            ? flags.isScaleTicketVerified
            : evidence.isScaleTicketVerified,
        scaleNetWeightLbs:
          typeof flags.scaleNetWeightLbs === "number"
            ? flags.scaleNetWeightLbs
            : evidence.scaleNetWeightLbs,
        metadata:
          flags.truepicMetadata !== undefined
            ? ({ ...((evidence.metadata as Record<string, unknown> | null) ?? {}), ...flags.truepicMetadata } as unknown as Prisma.InputJsonValue)
            : ((evidence.metadata ?? {}) as unknown as Prisma.InputJsonValue),
      },
    });
    await auditLogger.write(tx, {
      actorRole: "PARTNER",
      action: "EVIDENCE_FLAG_VERIFIED",
      entityType: "Evidence",
      entityId: evidenceId,
      after: { flags },
    });
    return updated;
  });
}

/**
 * Automated arbitration resolution: computes the deterministic settlement
 * vector from the verdict and records it on the dispute. The escrow remains in
 * ARBITRATION_PROCESSING until the settlement orchestrator executes the
 * payouts and flips it to RESOLVED_DISBURSED / REFUNDED.
 */
export async function resolveArbitration(
  disputeId: string,
  input: { verdict: DisputeVerdict; actor: EscrowActor; userId?: string },
): Promise<{ dispute: AutomatedDispute; vector: SettlementVector }> {
  return runEscrowTransaction(
    async (tx) => {
      const dispute = await tx.automatedDispute.findUnique({ where: { id: disputeId } });
      if (!dispute) throw new DisputeNotFoundError(disputeId);

      const rows = await tx.$queryRaw<EscrowTransaction[]>`
        SELECT * FROM "EscrowTransaction" WHERE id = ${dispute.escrowId} FOR UPDATE`;
      const escrow = rows[0];
      if (!escrow) throw new EscrowNotFoundError(dispute.escrowId);

      // Verdict entry is valid whether the dispute was escalated explicitly
      // (escrow already ARBITRATION_PROCESSING) or the arbiter records the
      // verdict directly from DISPUTED — in which case recording a verdict
      // implies formal arbitration, so escalate in the same transaction.
      if (escrow.status !== "ARBITRATION_PROCESSING") {
        assertTransition(escrow.status, "ARBITRATION_PROCESSING", {
          escrow,
          actor: input.actor,
          now: new Date(),
          meta: { dispute },
        });
        await tx.escrowTransaction.update({
          where: { id: escrow.id },
          data: { status: "ARBITRATION_PROCESSING", version: { increment: 1 } },
        });
      }

      const settlementInput = {
        saleAmountCents: escrow.saleAmountCents,
        contractedWeightLbs: escrow.contractedWeightLbs,
        deliveredWeightLbs: escrow.deliveredWeightLbs,
        weightTolerancePct: escrow.weightTolerancePct,
        pricePerLbMicros: escrow.pricePerLbMicros,
        freightFeeCents: escrow.freightFeeCents,
        platformFeeBps: escrow.platformFeeBps,
      };
      const breakdown = computeSettlementBreakdown(settlementInput);
      const vector = computeDisputeVector(input.verdict, settlementInput, breakdown);

      const dbStatus: DbDisputeStatus = input.verdict;
      const updatedDispute = await tx.automatedDispute.update({
        where: { id: disputeId },
        data: {
          status: dbStatus,
          verdict: input.verdict,
          settlementVector: vector as unknown as Prisma.InputJsonValue,
          resolvedAt: new Date(),
        },
      });
      await tx.milestone.create({
        data: {
          escrowId: dispute.escrowId,
          kind: "DISPUTE_RESOLVED",
          occurredAt: new Date(),
          actorUserId: input.userId,
          metadata: { disputeId, verdict: input.verdict, vector } as unknown as Prisma.InputJsonValue,
        },
      });
      await auditLogger.write(tx, {
        actorUserId: input.userId,
        actorRole: input.actor,
        action: "ARBITRATION_RESOLVED",
        entityType: "AutomatedDispute",
        entityId: disputeId,
        after: { verdict: input.verdict, vector },
      });
      return { dispute: updatedDispute, vector };
    },
  );
}

/**
 * Pre-flight sanity check that the ledger shows enough funds held in the
 * platform escrow account to cover a settlement vector. (The escrow account
 * is shared across escrows; this is a coarse guard, not an allocation.)
 */
export async function assertEscrowFundedInLedger(saleAmountCents: number): Promise<void> {
  const account = await prisma.ledgerAccount.findFirst({
    where: { ownerType: "PLATFORM", accountType: "PLATFORM_ESCROW" },
  });
  if (!account) throw new ValidationError("platform escrow account missing");
  const balance = await getBalance(account.id);
  if (balance < cents(saleAmountCents)) {
    throw new ValidationError("ledger escrow balance is below the settlement amount", {
      balance,
      required: saleAmountCents,
    });
  }
}
