import { Worker } from "bullmq";
import { prisma } from "@livestock/db";
import { IllegalTransitionError, TransactionManager } from "@livestock/domain";
import { QUEUE_NAMES } from "../queues";
import type { DisputeProofDeadlineJobData } from "../queues";
import { logger } from "../logger";
import type IORedis from "ioredis";

/**
 * The 48-hour dispute evidence deadline. Once the window closes, an OPEN
 * dispute auto-escalates to ARBITRATION_PROCESSING so the rules engine can
 * resolve it from the verified evidence flags (scale ticket OCR, vet
 * certification, Truepic) — or default to a conservative vector if neither
 * side submitted usable evidence.
 */
export function createDisputeProofDeadlineWorker(
  connection: IORedis,
  deps: { transactionManager?: TransactionManager } = {},
): Worker<DisputeProofDeadlineJobData> {
  const tm = deps.transactionManager ?? new TransactionManager();

  const worker = new Worker<DisputeProofDeadlineJobData>(
    QUEUE_NAMES.disputeProofDeadline,
    async (job) => {
      const { escrowId } = job.data;
      const dispute = await prisma.automatedDispute.findFirst({
        where: { escrowId, status: "OPEN" },
      });
      if (!dispute) {
        // Already escalated or resolved — nothing to do.
        await markDisputeReceipt(escrowId, "SKIPPED");
        return;
      }
      try {
        await tm.submitForArbitration(dispute.id, { actor: "SYSTEM_TIMER" });
      } catch (err) {
        if (err instanceof IllegalTransitionError) {
          logger.info({ escrowId, reason: err.message }, "dispute-proof-deadline no-op");
          await markDisputeReceipt(escrowId, "SKIPPED");
          return;
        }
        throw err;
      }
      await markDisputeReceipt(escrowId, "COMPLETED");
      logger.info({ escrowId, disputeId: dispute.id }, "dispute escalated to arbitration");
    },
    { connection, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { escrowId: job?.data.escrowId, error: err.message },
      "dispute-proof-deadline job failed",
    );
  });
  worker.on("error", (err) => {
    logger.error({ error: err.message }, "dispute-proof-deadline worker error");
  });
  return worker;
}

export async function markDisputeReceipt(escrowId: string, status: "COMPLETED" | "SKIPPED" | "FAILED"): Promise<void> {
  await prisma.scheduleReceipt.updateMany({
    where: { escrowId, jobKind: "DISPUTE_PROOF_DEADLINE" },
    data: { status, completedAt: status === "COMPLETED" || status === "SKIPPED" ? new Date() : null },
  });
}
