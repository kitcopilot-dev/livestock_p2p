/**
 * Integer-cents money. All monetary amounts in the system are integer cents
 * (USD default). Floating point is never used for money.
 */

export type Cents = number & { readonly __brand: "Cents" };

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`cents() requires a safe integer, got ${value}`);
  }
  return value as Cents;
}

export function addCents(a: Cents, b: Cents): Cents {
  return cents(a + b);
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b);
}

export function isNonNegativeCents(v: Cents): boolean {
  return v >= 0;
}

export function assertNonNegativeCents(v: Cents, label: string): void {
  if (v < 0) {
    throw new RangeError(`${label} must be non-negative, got ${v}`);
  }
}

/**
 * Round half away from zero, integer result. Used for every cents conversion
 * so rounding is deterministic across environments.
 */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value));
}

/**
 * Basis-point percentage of an amount in cents: `bps` out of 10_000.
 * e.g. platformFeeBps = 250 -> 2.5% of saleAmountCents.
 */
export function bpsOf(amountCents: Cents, bps: number): Cents {
  if (!Number.isSafeInteger(bps)) {
    throw new RangeError(`bps must be an integer, got ${bps}`);
  }
  return cents(roundHalfUp((amountCents * bps) / 10_000));
}

/**
 * Multiply an integer amount by a rational numerator/denominator with
 * round-half-up. Used for shrink penalties (micro-cents per pound).
 */
export function mulRational(amount: Cents, numerator: number, denominator: number): Cents {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError(`mulRational requires safe integers, got ${numerator}/${denominator}`);
  }
  if (denominator === 0) {
    throw new RangeError("mulRational denominator must be non-zero");
  }
  return cents(roundHalfUp((amount * numerator) / denominator));
}

/**
 * Sum a list of cents values.
 */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return cents(total);
}
