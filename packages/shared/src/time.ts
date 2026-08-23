/**
 * Time-locked window constants. Business rule: a buyer has a 24-hour
 * inspection window after delivery; once a dispute is filed, both parties have
 * 48 hours to submit evidence before automated arbitration.
 */
export const INSPECTION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DISPUTE_PROOF_WINDOW_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Demo speed controls — override windows via env vars so BullMQ workers
// fire live in the Preview tab without waiting 24h/48h.
// ---------------------------------------------------------------------------

/** Inspection window in ms. Reads DEMO_INSPECTION_WINDOW_MS env (e.g. "30000" = 30s). */
export function getInspectionWindowMs(): number {
  const raw = process.env.DEMO_INSPECTION_WINDOW_MS;
  if (raw) {
    const ms = Number(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return INSPECTION_WINDOW_MS;
}

/** Dispute proof window in ms. Reads DEMO_DISPUTE_PROOF_WINDOW_MS env (e.g. "60000" = 60s). */
export function getDisputeProofWindowMs(): number {
  const raw = process.env.DEMO_DISPUTE_PROOF_WINDOW_MS;
  if (raw) {
    const ms = Number(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return DISPUTE_PROOF_WINDOW_MS;
}

/** Whether the system is running in demo-fast mode (any window < 1 hour). */
export function isDemoSpeedMode(): boolean {
  return getInspectionWindowMs() < 3_600_000 || getDisputeProofWindowMs() < 3_600_000;
}

/** Default BullMQ backoff: 2^attempt seconds capped at 10 minutes. */
export function retryBackoffMs(attempt: number): number {
  return Math.min(Math.pow(2, attempt) * 1000, 10 * 60 * 1000);
}

export const MAX_SETTLEMENT_ATTEMPTS = 5;
