import { JobScheduler, Worker } from "bullmq";
import { prisma } from "@livestock/db";
import { createQueues, createProducerConnection, QUEUE_NAMES } from "../queues";
import { logger } from "../logger";
import type IORedis from "ioredis";

/**
 * Reconciliation sweep — the backstop that makes the time-locked windows
 * survive queue loss, worker crashes, and network partitions.
 *
 * Every 5 minutes it scans the database for escrows whose deadline has passed
 * but whose job did not complete:
 *   - INSPECTION_PERIOD past inspectionDeadlineAt with no COMPLETED
 *     INSPECTION_TIMEOUT receipt -> re-enqueue (BullMQ jobId dedupes, so a
 *     still-pending delayed job is never duplicated).
 *   - DISPUTED past disputeProofDeadlineAt with no COMPLETED
 *     DISPUTE_PROOF_DEADLINE receipt -> re-enqueue.
 *
 * The worker-side guards (row lock + state re-check) make every execution
 * idempotent, so double scheduling is harmless.
 */
export async function runReconciliationSweep(
  queues: ReturnType<typeof createQueues>,
  now: Date = new Date(),
): Promise<{ enqueuedInspection: number; enqueuedDispute: number }> {
  const enqueuedInspection = await reenqueueExpiredInspections(queues, now);
  const enqueuedDispute = await reenqueueExpiredDisputeDeadlines(queues, now);
  return { enqueuedInspection, enqueuedDispute };
}

async function reenqueueExpiredInspections(
  queues: ReturnType<typeof createQueues>,
  now: Date,
): Promise<number> {
  const overdue = await prisma.escrowTransaction.findMany({
    where: {
      status: "INSPECTION_PERIOD",
      inspectionDeadlineAt: { lt: now },
    },
    select: { id: true },
    take: 500,
  });
  let count = 0;
  for (const escrow of overdue) {
    const receipt = await prisma.scheduleReceipt.findUnique({
      where: { escrowId_jobKind: { escrowId: escrow.id, jobKind: "INSPECTION_TIMEOUT" } },
    });
    if (receipt?.status === "COMPLETED" || receipt?.status === "SKIPPED") continue;
    await queues.inspectionTimeout.add(
      "inspection-timeout",
      { escrowId: escrow.id },
      { jobId: `inspection:${escrow.id}`, delay: 0, attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
    );
    count += 1;
  }
  if (count > 0) logger.info({ count }, "sweep: re-enqueued expired inspections");
  return count;
}

async function reenqueueExpiredDisputeDeadlines(
  queues: ReturnType<typeof createQueues>,
  now: Date,
): Promise<number> {
  const overdue = await prisma.escrowTransaction.findMany({
    where: {
      status: "DISPUTED",
      disputeProofDeadlineAt: { lt: now },
    },
    select: { id: true },
    take: 500,
  });
  let count = 0;
  for (const escrow of overdue) {
    const receipt = await prisma.scheduleReceipt.findUnique({
      where: { escrowId_jobKind: { escrowId: escrow.id, jobKind: "DISPUTE_PROOF_DEADLINE" } },
    });
    if (receipt?.status === "COMPLETED" || receipt?.status === "SKIPPED") continue;
    await queues.disputeProofDeadline.add(
      "dispute-proof-deadline",
      { escrowId: escrow.id },
      { jobId: `dispute:${escrow.id}`, delay: 0, attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
    );
    count += 1;
  }
  if (count > 0) logger.info({ count }, "sweep: re-enqueued expired dispute deadlines");
  return count;
}

/** Cron-style repeatable worker: runs the sweep every 5 minutes. */
export function createSweepWorker(connection: IORedis): Worker<Record<string, never>> {
  const queues = createQueues(connection);
  void QUEUE_NAMES;

  const worker = new Worker<Record<string, never>>(
    QUEUE_NAMES.sweep,
    async () => {
      const result = await runReconciliationSweep(queues, new Date());
      logger.info(result, "reconciliation sweep complete");
    },
    { connection, concurrency: 1 },
  );
  worker.on("error", (err) => {
    logger.error({ error: err.message }, "sweep worker error");
  });
  return worker;
}

/**
 * Registers the recurring sweep via BullMQ 6's JobScheduler (the `repeat`
 * option on Queue.add was removed in v6). The scheduler re-creates the
 * recurring job after restarts from its own repeat state in Redis.
 */
export async function scheduleSweep(
  queues: ReturnType<typeof createQueues>,
  repeatPattern = "*/5 * * * *",
  connection?: IORedis,
): Promise<void> {
  if (!connection) {
    throw new Error("scheduleSweep requires a Redis connection");
  }
  const scheduler = new JobScheduler(QUEUE_NAMES.sweep, { connection });
  await scheduler.upsertJobScheduler(
    "sweep-cron",
    { pattern: repeatPattern },
    "sweep",
    {},
    { attempts: 1, removeOnComplete: { count: 10 } },
    { override: true },
  );
  logger.info({ repeatPattern }, "scheduled reconciliation sweep");
}

/** One-off sweep (used by tests and manual ops). */
export async function runSweepOnce(): Promise<{ enqueuedInspection: number; enqueuedDispute: number }> {
  const connection = createProducerConnection();
  try {
    const queues = createQueues(connection);
    return await runReconciliationSweep(queues, new Date());
  } finally {
    await connection.quit();
  }
}
