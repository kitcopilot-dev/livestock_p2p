import { loadRootEnv } from "@livestock/shared";
import { createWorkerConnection } from "./queues";
import { createInspectionTimeoutWorker } from "./workers/inspectionTimeout";
import { createDisputeProofDeadlineWorker } from "./workers/disputeProofDeadline";
import { createSettlementRetryWorker } from "./workers/settlementRetry";
import { createSweepWorker, scheduleSweep } from "./workers/reconciliationSweep";
import { createQueues } from "./queues";
import { logger } from "./logger";

/**
 * Worker process entrypoint (`pnpm --filter @livestock/jobs dev`).
 * Runs all four workers; SIGTERM/SIGINT drain gracefully so in-flight jobs
 * finish and stalled-job recovery kicks in only on hard kills.
 */
async function main(): Promise<void> {
  loadRootEnv();
  const connection = createWorkerConnection();
  const workers = [
    createInspectionTimeoutWorker(connection),
    createDisputeProofDeadlineWorker(connection),
    createSettlementRetryWorker(connection),
    createSweepWorker(connection),
  ];

  const queues = createQueues(connection);
  await scheduleSweep(queues, "*/5 * * * *", connection).catch((err) => {
    logger.error({ error: (err as Error).message }, "failed to schedule sweep (will retry on restart)");
  });

  logger.info({ workers: workers.length }, "livestock workers started");

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down workers");
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ error: (err as Error).stack }, "worker process crashed");
  process.exit(1);
});
