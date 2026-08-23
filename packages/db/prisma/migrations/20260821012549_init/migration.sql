-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'HAULER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('PLATFORM_ESCROW', 'PLATFORM_REVENUE', 'USER_WALLET', 'SUSPENSE');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('FUNDING', 'SETTLEMENT', 'REVERSAL', 'CHARGEBACK', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('PENDING', 'COMMITTED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('DRAFT', 'FUNDED', 'IN_TRANSIT', 'DELIVERED', 'INSPECTION_PERIOD', 'DISPUTED', 'ARBITRATION_PROCESSING', 'RESOLVED_DISBURSED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'ARBITRATION_PROCESSING', 'RESOLVED_BUYER_WINS', 'RESOLVED_SELLER_WINS', 'RESOLVED_SPLIT');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('QUALITY', 'WEIGHT_SHRINK', 'VET_CERTIFICATION', 'NON_DELIVERY', 'DAMAGED', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('UPLOAD', 'SCALE_TICKET_OCR', 'VET_TELEHEALTH', 'TRUEPIC_CAPTURE');

-- CreateEnum
CREATE TYPE "EvidenceFileType" AS ENUM ('IMAGE', 'PDF', 'JSON', 'VIDEO');

-- CreateEnum
CREATE TYPE "PaymentRail" AS ENUM ('STRIPE', 'DWOLLA');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MilestoneKind" AS ENUM ('CREATED', 'FUNDED', 'PICKUP', 'DELIVERED', 'INSPECTION_STARTED', 'INSPECTION_DEADLINE', 'DISPUTE_FILED', 'DISPUTE_PROOF_DEADLINE', 'DISPUTE_RESOLVED', 'RELEASED', 'REFUNDED', 'CANCELLED', 'SETTLEMENT_FAILED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('INSPECTION_TIMEOUT', 'DISPUTE_PROOF_DEADLINE', 'SETTLEMENT_RETRY', 'SETTLEMENT_EXECUTION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "stripeConnectedAccountId" TEXT,
    "dwollaCustomerId" TEXT,
    "plaidAccessTokenEnc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "accountType" "LedgerAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "externalAccountRef" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "entryType" "LedgerEntryType" NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'COMMITTED',
    "transactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "reversalOfEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowTransaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "haulerId" TEXT NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "saleAmountCents" INTEGER NOT NULL,
    "contractedWeightLbs" INTEGER NOT NULL,
    "deliveredWeightLbs" INTEGER,
    "weightTolerancePct" INTEGER NOT NULL DEFAULT 2,
    "pricePerLbMicros" INTEGER NOT NULL,
    "freightFeeCents" INTEGER NOT NULL,
    "platformFeeBps" INTEGER NOT NULL,
    "platformFeeCents" INTEGER,
    "shrinkPenaltyCents" INTEGER,
    "inspectionDeadlineAt" TIMESTAMP(3),
    "disputeProofDeadlineAt" TIMESTAMP(3),
    "settlementAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "kind" "MilestoneKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "actorUserId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomatedDispute" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "filedByUserId" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "verdict" TEXT,
    "settlementVector" JSONB,
    "filedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AutomatedDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "fileType" "EvidenceFileType" NOT NULL,
    "storageUri" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "isVetCertified" BOOLEAN NOT NULL DEFAULT false,
    "isScaleTicketVerified" BOOLEAN NOT NULL DEFAULT false,
    "scaleNetWeightLbs" INTEGER,
    "ocrConfidence" DOUBLE PRECISION,
    "metadata" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "rail" "PaymentRail" NOT NULL,
    "railOperation" TEXT NOT NULL,
    "railReferenceId" TEXT,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "destinationAccountRef" TEXT,
    "sourceAccountRef" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleReceipt" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "jobKind" "JobKind" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "bullmqJobId" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScheduleReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeConnectedAccountId_key" ON "User"("stripeConnectedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_dwollaCustomerId_key" ON "User"("dwollaCustomerId");

-- CreateIndex
CREATE INDEX "LedgerAccount_accountType_idx" ON "LedgerAccount"("accountType");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_ownerType_ownerUserId_accountType_key" ON "LedgerAccount"("ownerType", "ownerUserId", "accountType");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_transactionId_idx" ON "LedgerEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_debitAccountId_createdAt_idx" ON "LedgerEntry"("debitAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_creditAccountId_createdAt_idx" ON "LedgerEntry"("creditAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_status_idx" ON "LedgerEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowTransaction_reference_key" ON "EscrowTransaction"("reference");

-- CreateIndex
CREATE INDEX "EscrowTransaction_status_inspectionDeadlineAt_idx" ON "EscrowTransaction"("status", "inspectionDeadlineAt");

-- CreateIndex
CREATE INDEX "EscrowTransaction_buyerId_idx" ON "EscrowTransaction"("buyerId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_sellerId_idx" ON "EscrowTransaction"("sellerId");

-- CreateIndex
CREATE INDEX "EscrowTransaction_haulerId_idx" ON "EscrowTransaction"("haulerId");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_escrowId_kind_key" ON "Milestone"("escrowId", "kind");

-- CreateIndex
CREATE INDEX "AutomatedDispute_escrowId_idx" ON "AutomatedDispute"("escrowId");

-- CreateIndex
CREATE INDEX "Evidence_disputeId_idx" ON "Evidence"("disputeId");

-- CreateIndex
CREATE INDEX "Evidence_fileSha256_idx" ON "Evidence"("fileSha256");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentIntent_escrowId_idx" ON "PaymentIntent"("escrowId");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE INDEX "ScheduleReceipt_jobKind_status_idx" ON "ScheduleReceipt"("jobKind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleReceipt_escrowId_jobKind_key" ON "ScheduleReceipt"("escrowId", "jobKind");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_hash_key" ON "AuditLog"("hash");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversalOfEntryId_fkey" FOREIGN KEY ("reversalOfEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_haulerId_fkey" FOREIGN KEY ("haulerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomatedDispute" ADD CONSTRAINT "AutomatedDispute_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomatedDispute" ADD CONSTRAINT "AutomatedDispute_filedByUserId_fkey" FOREIGN KEY ("filedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "AutomatedDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleReceipt" ADD CONSTRAINT "ScheduleReceipt_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Custom enforcement layer (raw SQL)
-- ============================================================================

-- Sequence for human-readable escrow references (ESC-YYYY-<seq>)
CREATE SEQUENCE "escrow_reference_seq";

-- --- Ledger entry invariants -------------------------------------------------
-- Enforced at the database so no application bug can post an unbalanced,
-- non-positive, or cross-currency journal entry.

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_amount_positive" CHECK ("amountCents" > 0),
  ADD CONSTRAINT "LedgerEntry_accounts_distinct" CHECK ("debitAccountId" <> "creditAccountId");

CREATE OR REPLACE FUNCTION enforce_ledger_entry_invariants() RETURNS trigger AS $$
DECLARE
  debit_currency  text;
  credit_currency text;
BEGIN
  IF NEW."amountCents" <= 0 THEN
    RAISE EXCEPTION 'LedgerEntry.amountCents must be positive';
  END IF;
  IF NEW."debitAccountId" = NEW."creditAccountId" THEN
    RAISE EXCEPTION 'LedgerEntry debit and credit accounts must differ';
  END IF;

  SELECT currency INTO debit_currency FROM "LedgerAccount" WHERE id = NEW."debitAccountId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LedgerEntry debit account % does not exist', NEW."debitAccountId";
  END IF;
  SELECT currency INTO credit_currency FROM "LedgerAccount" WHERE id = NEW."creditAccountId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LedgerEntry credit account % does not exist', NEW."creditAccountId";
  END IF;

  IF debit_currency IS DISTINCT FROM credit_currency THEN
    RAISE EXCEPTION 'LedgerEntry currency mismatch between accounts (%) and (%)',
      debit_currency, credit_currency;
  END IF;
  IF NEW.currency IS DISTINCT FROM debit_currency THEN
    RAISE EXCEPTION 'LedgerEntry.currency must match account currency (%)', debit_currency;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_invariants
  BEFORE INSERT OR UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION enforce_ledger_entry_invariants();

-- --- Ledger account balance view ---------------------------------------------
-- Balances are always derived from the committed entry stream. PENDING/FAILED/
-- REVERSED entries are excluded so money-in-motion never shows as balance.

CREATE VIEW "LedgerAccountBalance" AS
SELECT
  legs.account_id,
  SUM(legs.signed_amount)::bigint AS balance_cents
FROM (
  SELECT "debitAccountId" AS account_id, -"amountCents" AS signed_amount
    FROM "LedgerEntry" WHERE status = 'COMMITTED'
  UNION ALL
  SELECT "creditAccountId" AS account_id,  "amountCents" AS signed_amount
    FROM "LedgerEntry" WHERE status = 'COMMITTED'
) legs
GROUP BY legs.account_id;

-- --- Platform singleton ledger accounts ---------------------------------------
-- Only one PLATFORM_ESCROW / PLATFORM_REVENUE / SUSPENSE account per type.

CREATE UNIQUE INDEX "LedgerAccount_platform_singleton"
  ON "LedgerAccount" ("accountType")
  WHERE "ownerUserId" IS NULL;

-- --- One open dispute per escrow ----------------------------------------------

CREATE UNIQUE INDEX "AutomatedDispute_one_open_per_escrow"
  ON "AutomatedDispute" ("escrowId")
  WHERE status IN ('OPEN', 'ARBITRATION_PROCESSING');

-- --- Append-only audit log ----------------------------------------------------
-- UPDATE/DELETE on AuditLog are rejected at the database level.

CREATE OR REPLACE FUNCTION deny_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only; UPDATE/DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION deny_audit_log_mutation();
