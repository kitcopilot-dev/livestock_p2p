import { DomainError } from "@livestock/shared";
import { hmacSha256Hex, safeEqualHex } from "./crypto";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export interface SignatureVerificationInput {
  /** Raw request body exactly as received (byte-for-byte). */
  rawBody: string | Buffer;
  /** Signature from the provider header. */
  signature: string;
  /** Shared HMAC secret (partner webhook secret). */
  secret: string;
  /**
   * Optional unix-seconds timestamp from a header (e.g. `x-timestamp`).
   * When present, a replay window is enforced.
   */
  timestampSeconds?: number | string;
  /** Replay window; defaults to 5 minutes. */
  maxAgeMs?: number;
  /** System clock override for tests. */
  now?: Date;
}

/**
 * Generic HMAC-SHA256 webhook signature verification for providers that do not
 * ship their own SDK (Dwolla webhooks, Truepic, OCR engines, vet telehealth).
 * Stripe webhooks are verified with `stripe.webhooks.constructEvent` inside the
 * payments package instead.
 *
 * Protections:
 *  - constant-time comparison (timingSafeEqual)
 *  - replay window when a timestamp header is supplied
 *  - no signature -> rejection (never fall through)
 */
export function verifyHmacSignature(input: SignatureVerificationInput): void {
  const expected = hmacSha256Hex(input.rawBody, input.secret);
  if (!safeEqualHex(input.signature, expected)) {
    throw new DomainError("WEBHOOK_SIGNATURE_INVALID", "Webhook signature mismatch", {
      retryable: false,
    });
  }

  if (input.timestampSeconds !== undefined) {
    const ts = Number(input.timestampSeconds);
    if (!Number.isFinite(ts)) {
      throw new DomainError("WEBHOOK_TIMESTAMP_INVALID", "Webhook timestamp is not a number");
    }
    const now = input.now ?? new Date();
    const ageMs = Math.abs(now.getTime() - ts * 1000);
    const maxAge = input.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    if (ageMs > maxAge) {
      throw new DomainError("WEBHOOK_REPLAY", `Webhook timestamp is outside the ${maxAge}ms window`, {
        retryable: false,
      });
    }
  }
}

/**
 * Verifies a signed provider payload (JSON) — used by partner webhooks that
 * carry verification claims (Truepic authenticity, OCR scale-ticket values,
 * vet telehealth certification) plus a timestamp and nonce.
 */
export function verifySignedPayload(
  payload: unknown,
  signature: string,
  secret: string,
  opts: { maxAgeMs?: number; now?: Date } = {},
): void {
  verifyHmacSignature({
    rawBody: JSON.stringify(payload),
    signature,
    secret,
    timestampSeconds: (payload as { issuedAt?: unknown })?.issuedAt as number | undefined,
    maxAgeMs: opts.maxAgeMs,
    now: opts.now,
  });
}
