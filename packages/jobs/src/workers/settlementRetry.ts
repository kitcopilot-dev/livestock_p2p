import { Worker } from "bullmq";
import { prisma } from "@livestock/db";
import { processEscrowSettlement, type PaymentProvider, SettlementFailedError } from "@livestock/payments";
import { IllegalTransitionError, type SettlementVector } from "@livestock/domain";
import { QUEUE_NAMES } from "../queues";
import type { SettlementRetryJobData } from "../queues";
import { logger } from "../logger";
import type IORedis from "ioredis";

/**
 * Retries failed settlement legs. processEscrowSettlement is fully idempotent:
 * existing PaymentIntents are reused, SUCCEEDED legs are skipped, FAILED legs
 * re-attempt within the budget (MAX_SETTLEMENT_ATTEMPTS). Once the budget is
 * exhausted the job fails permanently into the DLQ where ops reconciles
 * manually — money is never left in an unknown state because the escrow row
 * only flips to RESOLVED_DISBURSED after every leg commits.
 */
export function createSettlementRetryWorker(
  connection: IORedis,
  deps: { providers?: Partial<Record<"STRIPE" | "DWOLLA", PaymentProvider>> } = {},
): Worker<SettlementRetryJobData> {
  const worker = new Worker<SettlementRetryJobData>(
    QUEUE_NAMES.settlementRetry,
    async (job) => {
      const { escrowId } = job.data;
      logger.info({ escrowId, jobId: job.id }, "settlement-retry job started");

      const escrow = await prisma.escrowTransaction.findUnique({ where: { id: escrowId } });
      if (!escrow) {
        logger.warn({ escrowId }, "settlement-retry: escrow not found, dropping");
        return;
      }
      const terminal = ["RESOLVED_DISBURSED", "REFUNDED", "CANCELLED"] as const;
      if ((terminal as readonly string[]).includes(escrow.status)) {
        logger.info({ escrowId, status: escrow.status }, "settlement-retry no-op (terminal)");
        return;
      }

      let vector: SettlementVector | undefined;
      if (escrow.status === "ARBITRATION_PROCESSING") {
        const dispute = await prisma.automatedDispute.findFirst({
          where: { escrowId },
          orderBy: { filedAt: "desc" },
        });
        vector = dispute?.settlementVector as SettlementVector | null ?? undefined;
        if (!vector) {
          throw new SettlementFailedError("arbitration escrow has no settlement vector", { escrowId });
        }
      }

      try {
        await processEscrowSettlement(escrowId, { actor: "SYSTEM_TIMER", vector }, { providers: deps.providers });
      } catch (err) {
        if (err instanceof IllegalTransitionError) {
          logger.info({ escrowId, reason: err.message }, "settlement-retry no-op");
          return;
        }
        throw err;
      }
      logger.info({ escrowId, jobId: job.id }, "settlement-retry job completed");
    },
    { connection, concurrency: 3 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ escrowId: job?.data.escrowId, error: err.message }, "settlement-retry job failed");
  });
  worker.on("error", (err) => {
    logger.error({ error: err.message }, "settlement-retry worker error");
  });
  return worker;
}
