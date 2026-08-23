/**
 * Livestock weights in whole pounds. Scale tickets are whole pounds; fractions
 * are rounded to the nearest integer at ingest.
 */

export function assertPositiveInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`);
  }
}

/** Tolerance in pounds given a percentage (e.g. 2 -> 2%), round half up. */
export function toleranceLbs(contracted: number, tolerancePct: number): number {
  if (!Number.isSafeInteger(tolerancePct) || tolerancePct < 0) {
    throw new RangeError(`tolerancePct must be a non-negative integer, got ${tolerancePct}`);
  }
  return Math.round((contracted * tolerancePct) / 100);
}

/** Shrink in pounds: how far delivered fell below contracted minus tolerance. */
export function shrinkLbs(contracted: number, delivered: number, tolerancePct: number): number {
  const tolerance = toleranceLbs(contracted, tolerancePct);
  const shortfall = contracted - delivered - tolerance;
  return Math.max(0, shortfall);
}
