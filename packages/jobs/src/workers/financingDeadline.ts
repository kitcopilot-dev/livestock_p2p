import { Worker } from "bullmq";
import { prisma } from "@livestock/db";
import { TransactionManager, IllegalTransitionError } from "@livestock/domain";
import { QUEUE_NAMES, type FinancingDeadlineJobData } from "../queues";
import { logger } from "../logger";
import type IORedis from "ioredis";

/**
 * The financing (deferred-payment) auto-cancel job.
 *
 * Fires at paymentDeadlineAt for an escrow still in PENDING_PAYMENT. The
 * TransactionManager.expireUnfunded() path re-locks the row and re-validates
 * the state, so if the buyer funded at the exact same moment the guard fails
 * and the job no-ops cleanly (the funded path owns the escrow now). The
 * reconciliation sweep re-enqueues from ScheduleReceipt if the queue ever
 * loses the job.
 */
export function createFinancingDeadlineWorker(
  connection: IORedis,
): Worker<FinancingDeadlineJobData> {
  const worker = new Worker<FinancingDeadlineJobData>(
    QUEUE_NAMES.financingDeadline,
    async (job) => {
      const { escrowId } = job.data;
      logger.info({ escrowId, jobId: job.id }, "financing-deadline job started");

      try {
        await new TransactionManager().expireUnfunded(escrowId, { actor: "SYSTEM_TIMER" });
      } catch (err) {
        if (err instanceof IllegalTransitionError) {
          // Already funded or already cancelled — expected no-op.
          logger.info({ escrowId, reason: err.message }, "financing-deadline no-op");
          await markFinancingReceipt(escrowId, "SKIPPED");
          return;
        }
        throw err; // BullMQ retries with backoff, then the failed set
      }

      await markFinancingReceipt(escrowId, "COMPLETED");
      logger.info({ escrowId, jobId: job.id }, "financing-deadline job completed");
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { escrowId: job?.data.escrowId, attempts: job?.attemptsMade, error: err.message },
      "financing-deadline job failed",
    );
  });
  worker.on("error", (err) => {
    logger.error({ error: err.message }, "financing-deadline worker error");
  });
  return worker;
}

export async function markFinancingReceipt(
  escrowId: string,
  status: "COMPLETED" | "SKIPPED" | "FAILED",
): Promise<void> {
  await prisma.scheduleReceipt.updateMany({
    where: { escrowId, jobKind: "FINANCING_DEADLINE" },
    data: { status, completedAt: status === "COMPLETED" || status === "SKIPPED" ? new Date() : null },
  });
}
