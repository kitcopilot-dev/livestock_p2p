import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * BullMQ queues. Producers (scheduler) fail fast when Redis is down;
 * workers reconnect indefinitely (see worker creation). Redis is configured
 * with AOF persistence + noeviction (see docker-compose.yml) so delayed jobs
 * survive restarts and are never evicted.
 */

export const QUEUE_NAMES = {
  inspectionTimeout: "inspection-timeout",
  disputeProofDeadline: "dispute-proof-deadline",
  settlementRetry: "settlement-retry",
  sweep: "sweep",
} as const;

export interface InspectionTimeoutJobData {
  escrowId: string;
}

export interface DisputeProofDeadlineJobData {
  escrowId: string;
}

export interface SettlementRetryJobData {
  escrowId: string;
}

export function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return url;
}

/** Producer connection: fail fast so scheduling errors surface immediately. */
export function createProducerConnection(): IORedis {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

/** Worker connection: reconnect forever with BullMQ's default backoff. */
export function createWorkerConnection(): IORedis {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
  });
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1_000 },
};

export function createQueues(connection: IORedis): Record<keyof typeof QUEUE_NAMES, Queue> {
  return {
    inspectionTimeout: new Queue(QUEUE_NAMES.inspectionTimeout, { connection, defaultJobOptions }),
    disputeProofDeadline: new Queue(QUEUE_NAMES.disputeProofDeadline, { connection, defaultJobOptions }),
    settlementRetry: new Queue(QUEUE_NAMES.settlementRetry, { connection, defaultJobOptions }),
    sweep: new Queue(QUEUE_NAMES.sweep, { connection, defaultJobOptions }),
  };
}
