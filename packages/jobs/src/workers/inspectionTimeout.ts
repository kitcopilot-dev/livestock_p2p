import { Worker } from "bullmq";
import { prisma } from "@livestock/db";
import { autoReleaseFunds, type PaymentProvider } from "@livestock/payments";
import { IllegalTransitionError } from "@livestock/domain";
import { QUEUE_NAMES } from "../queues";
import type { InspectionTimeoutJobData } from "../queues";
import { logger } from "../logger";
import type IORedis from "ioredis";

/**
 * The 24-hour auto-release job.
 *
 * Execution protocol:
 *   1. processEscrowSettlement locks the escrow row (SERIALIZABLE) and
 *      re-validates: still INSPECTION_PERIOD, deadline reached, no open
 *      dispute, no prior release. If the buyer filed a dispute at the exact
 *      same millisecond, the guard fails and the job no-ops (the dispute
 *      path owns the escrow now).
 *   2. Payouts execute with idempotency keys; transient failures throw so the
 *      job retries with exponential backoff; permanent failures end in the
 *      failed-job set (DLQ) with ops alerting.
 *   3. On success the receipt is marked COMPLETED.
 */
export function createInspectionTimeoutWorker(
  connection: IORedis,
  deps: { providers?: Partial<Record<"STRIPE" | "DWOLLA", PaymentProvider>> } = {},
): Worker<InspectionTimeoutJobData> {
  const worker = new Worker<InspectionTimeoutJobData>(
    QUEUE_NAMES.inspectionTimeout,
    async (job) => {
      const { escrowId } = job.data;
      logger.info({ escrowId, jobId: job.id }, "inspection-timeout job started");

      try {
        await autoReleaseFunds(escrowId, { providers: deps.providers });
      } catch (err) {
        if (err instanceof IllegalTransitionError) {
          // Lost the race (buyer dispute won) or funds already released by
          // reconciliation — a clean, expected no-op.
          logger.info({ escrowId, reason: err.message }, "inspection-timeout no-op");
          await markReceipt(escrowId, "SKIPPED");
          return;
        }
        throw err; // BullMQ retries with backoff, then the job lands in the failed set
      }

      await markReceipt(escrowId, "COMPLETED");
      logger.info({ escrowId, jobId: job.id }, "inspection-timeout job completed");
    },
    {
      connection,
      concurrency: 5,
      // Worker connection must keep retrying (maxRetriesPerRequest null is set
      // on the connection itself; BullMQ overrides per-worker as needed).
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { escrowId: job?.data.escrowId, attempts: job?.attemptsMade, error: err.message },
      "inspection-timeout job failed",
    );
  });
  worker.on("error", (err) => {
    logger.error({ error: err.message }, "inspection-timeout worker error");
  });
  return worker;
}

export async function markReceipt(escrowId: string, status: "COMPLETED" | "SKIPPED" | "FAILED"): Promise<void> {
  await prisma.scheduleReceipt.updateMany({
    where: { escrowId, jobKind: "INSPECTION_TIMEOUT" },
    data: { status, completedAt: status === "COMPLETED" || status === "SKIPPED" ? new Date() : null },
  });
}
