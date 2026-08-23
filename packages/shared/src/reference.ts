/**
 * Human-readable references for support and compliance traceability.
 * Format: ESC-<year>-<zero-padded sequence>, e.g. ESC-2026-000123.
 */
export function formatEscrowReference(seq: number, now: Date = new Date()): string {
  if (!Number.isSafeInteger(seq) || seq < 0) {
    throw new RangeError(`seq must be a non-negative safe integer, got ${seq}`);
  }
  const year = now.getUTCFullYear();
  return `ESC-${year}-${String(seq).padStart(6, "0")}`;
}

/** Stable idempotency key for a funding charge of an escrow. */
export function fundingKey(escrowId: string): string {
  return `fund:${escrowId}`;
}

/** Stable idempotency key for a payout transfer backed by a PaymentIntent row. */
export function settlementKey(paymentIntentId: string): string {
  return `settle:${paymentIntentId}`;
}

/** Idempotency key for an internal ledger journal (one key per journal). */
export function journalKey(scope: string, nonce: string): string {
  return `journal:${scope}:${nonce}`;
}
