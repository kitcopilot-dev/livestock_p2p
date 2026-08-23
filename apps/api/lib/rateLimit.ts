import IORedis from "ioredis";

/**
 * Redis-backed rate limiting for auth endpoints (password reset, magic links).
 *
 * Two layers per key:
 *   - hard cap within a rolling window (INCR + EXPIRE), e.g. 3/hour
 *   - minimum spacing between requests (SET NX EX), e.g. 1 per 60s
 *
 * Fails open: if Redis is unreachable the request is allowed through with a
 * logged warning, so sign-in availability never depends on Redis being up.
 */

let clientPromise: Promise<IORedis | null> | null = null;

async function getClient(): Promise<IORedis | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!clientPromise) {
    const client = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true, // defer auto-connect so the explicit connect() below is the first
    });
    clientPromise = client
      .connect()
      .then(() => client)
      .catch(async (err: Error) => {
        console.error("[rateLimit] Redis connect failed, failing open:", err.message);
        clientPromise = null; // allow a fresh attempt on the next call
        try {
          client.disconnect();
        } catch {
          /* already disconnected */
        }
        return null;
      });
  }
  return clientPromise;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  opts: { max: number; windowSeconds: number; cooldownSeconds?: number },
): Promise<RateLimitResult> {
  const redis = await getClient();
  if (!redis) return { allowed: true, retryAfterSeconds: 0 };

  try {
    const countKey = `rl:${key}:count`;
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, opts.windowSeconds);
    if (count > opts.max) {
      const ttl = await redis.ttl(countKey);
      return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
    }

    if (opts.cooldownSeconds) {
      const set = await redis.set(`rl:${key}:cooldown`, "1", "EX", opts.cooldownSeconds, "NX");
      if (set !== "OK") {
        return { allowed: false, retryAfterSeconds: opts.cooldownSeconds };
      }
    }

    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.error("[rateLimit] Redis error, failing open:", (err as Error).message);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
