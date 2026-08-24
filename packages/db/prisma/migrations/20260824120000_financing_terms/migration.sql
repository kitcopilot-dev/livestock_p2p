-- Financing terms (deferred payment):
--   * paymentDeadlineAt — buyer must fund by this instant or the escrow
--     auto-cancels (FINANCING_DEADLINE job + sweep backstop).
--   * financingFeeCents — 1% of sale (bps-tunable), owed at funding time.
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'FINANCING_FEE';
ALTER TYPE "MilestoneKind" ADD VALUE IF NOT EXISTS 'PAYMENT_DEADLINE_MISSED';
ALTER TYPE "MilestoneKind" ADD VALUE IF NOT EXISTS 'FINANCING_ELECTED';
ALTER TYPE "JobKind" ADD VALUE IF NOT EXISTS 'FINANCING_DEADLINE';

ALTER TABLE "EscrowTransaction" ADD COLUMN IF NOT EXISTS "paymentDeadlineAt" TIMESTAMP(3);
ALTER TABLE "EscrowTransaction" ADD COLUMN IF NOT EXISTS "financingFeeCents" INTEGER;

CREATE INDEX IF NOT EXISTS "EscrowTransaction_status_paymentDeadlineAt_idx"
  ON "EscrowTransaction"("status", "paymentDeadlineAt");
