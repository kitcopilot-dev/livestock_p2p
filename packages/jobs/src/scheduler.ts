import { prisma } from "@livestock/db";
import {
  createQueues,
  createProducerConnection,
  QUEUE_NAMES,
  type FinancingDeadlineJobData,
  type InspectionTimeoutJobData,
} from "./queues";
import type { Queue } from "bullmq";
import { logger } from "./logger";

/**
 * Time-locked scheduling.
 *
 * Every schedule is durably recorded in the ScheduleReceipt table (unique per
 * escrow + job kind) IN ADDITION to the BullMQ delayed job. If the queue ever
 * loses a job, the reconciliation sweep re-enqueues it from the receipts —
 * the two layers together survive restarts and network partitions.
 */

export interface SchedulerDeps {
  queues?: Record<keyof typeof QUEUE_NAMES, Queue>;
  clock?: () => Date;
}

let singletonQueues: Record<keyof typeof QUEUE_NAMES, Queue> | null = null;
let producerConnection: ReturnType<typeof createProducerConnection> | null = null;

function getQueues(deps: SchedulerDeps): Record<keyof typeof QUEUE_NAMES, Queue> {
  if (deps.queues) return deps.queues;
  if (!singletonQueues) {
    producerConnection = createProducerConnection();
    singletonQueues = createQueues(producerConnection);
  }
  return singletonQueues;
}

/** Close the shared producer connection (used in tests / graceful shutdown). */
export async function closeScheduler(): Promise<void> {
  if (producerConnection) {
    await producerConnection.quit();
    producerConnection = null;
    singletonQueues = null;
  }
}

/**
 * Schedules the 24h auto-release job. Called by the API immediately after
 * markDelivered() (which stamped inspectionDeadlineAt). jobId dedupes: calling
 * twice for the same escrow is a no-op on the queue side.
 */
export async function scheduleInspectionTimeout(
  escrowId: string,
  inspectionDeadlineAt: Date,
  deps: SchedulerDeps = {},
): Promise<void> {
  const queues = getQueues(deps);
  const now = deps.clock?.() ?? new Date();
  const delayMs = Math.max(0, inspectionDeadlineAt.getTime() - now.getTime());

  await prisma.scheduleReceipt.upsert({
    where: { escrowId_jobKind: { escrowId, jobKind: "INSPECTION_TIMEOUT" } },
    create: {
      escrowId,
      jobKind: "INSPECTION_TIMEOUT",
      scheduledFor: inspectionDeadlineAt,
      status: "SCHEDULED",
    },
    update: { scheduledFor: inspectionDeadlineAt, status: "SCHEDULED", completedAt: null },
  });

  const job = await queues.inspectionTimeout.add(
    "inspection-timeout",
    { escrowId } satisfies InspectionTimeoutJobData,
    {
      delay: delayMs,
      jobId: `inspection:${escrowId}`,
    },
  );
  logger.info({ escrowId, delayMs, jobId: job.id }, "scheduled inspection timeout");
}

/**
 * Schedules the 48h dispute-proof deadline job. Called after fileDispute()
 * stamps disputeProofDeadlineAt.
 */
export async function scheduleDisputeProofDeadline(
  escrowId: string,
  disputeProofDeadlineAt: Date,
  deps: SchedulerDeps = {},
): Promise<void> {
  const queues = getQueues(deps);
  const now = deps.clock?.() ?? new Date();
  const delayMs = Math.max(0, disputeProofDeadlineAt.getTime() - now.getTime());

  await prisma.scheduleReceipt.upsert({
    where: { escrowId_jobKind: { escrowId, jobKind: "DISPUTE_PROOF_DEADLINE" } },
    create: {
      escrowId,
      jobKind: "DISPUTE_PROOF_DEADLINE",
      scheduledFor: disputeProofDeadlineAt,
      status: "SCHEDULED",
    },
    update: { scheduledFor: disputeProofDeadlineAt, status: "SCHEDULED", completedAt: null },
  });

  const job = await queues.disputeProofDeadline.add(
    "dispute-proof-deadline",
    { escrowId },
    {
      delay: delayMs,
      jobId: `dispute:${escrowId}`,
    },
  );
  logger.info({ escrowId, delayMs, jobId: job.id }, "scheduled dispute proof deadline");
}

/**
 * Schedules the financing auto-cancel job. Called by the API immediately
 * after markPendingPayment() stamps paymentDeadlineAt. jobId dedupes.
 */
export async function scheduleFinancingDeadline(
  escrowId: string,
  paymentDeadlineAt: Date,
  deps: SchedulerDeps = {},
): Promise<void> {
  const queues = getQueues(deps);
  const now = deps.clock?.() ?? new Date();
  const delayMs = Math.max(0, paymentDeadlineAt.getTime() - now.getTime());

  await prisma.scheduleReceipt.upsert({
    where: { escrowId_jobKind: { escrowId, jobKind: "FINANCING_DEADLINE" } },
    create: {
      escrowId,
      jobKind: "FINANCING_DEADLINE",
      scheduledFor: paymentDeadlineAt,
      status: "SCHEDULED",
    },
    update: { scheduledFor: paymentDeadlineAt, status: "SCHEDULED", completedAt: null },
  });

  const job = await queues.financingDeadline.add(
    "financing-deadline",
    { escrowId } satisfies FinancingDeadlineJobData,
    {
      delay: delayMs,
      jobId: `financing:${escrowId}`,
    },
  );
  logger.info({ escrowId, delayMs, jobId: job.id }, "scheduled financing deadline");
}

/** Retry queue for failed settlement legs (exponential backoff, DLQ after max). */
export async function scheduleSettlementRetry(
  escrowId: string,
  deps: SchedulerDeps = {},
  delayMs = 60_000,
): Promise<void> {
  const queues = getQueues(deps);
  const job = await queues.settlementRetry.add(
    "settlement-retry",
    { escrowId },
    {
      delay: delayMs,
      jobId: `settle-retry:${escrowId}`,
    },
  );
  logger.info({ escrowId, jobId: job.id }, "scheduled settlement retry");
}
