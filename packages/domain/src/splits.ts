import {
  assertNonNegativeCents,
  bpsOf,
  cents,
  mulRational,
  roundHalfUp,
  shrinkLbs,
  type Cents,
} from "@livestock/shared";
import { ValidationError } from "./errors";

/**
 * Pure settlement math. Every function is deterministic (integer math,
 * round-half-up) and unit-tested; no provider or database access.
 */

export interface SettlementInput {
  saleAmountCents: number;
  contractedWeightLbs: number;
  /** null when the delivered weight was never verified (no shrink applied). */
  deliveredWeightLbs: number | null;
  weightTolerancePct: number;
  /** saleAmountCents * 1_000_000 / contractedWeightLbs, rounded half up. */
  pricePerLbMicros: number;
  freightFeeCents: number;
  platformFeeBps: number;
}

export interface SettlementBreakdown {
  saleAmountCents: Cents;
  freightFeeCents: Cents;
  platformFeeCents: Cents;
  shrinkPenaltyCents: Cents;
  sellerGrossCents: Cents;
  haulerNetCents: Cents;
  buyerRefundCents: Cents;
  platformRevenueCents: Cents;
}

/**
 * Computes the multi-party split:
 *   platformFee = bps of sale
 *   shrinkPenalty = shortfall lbs (beyond tolerance) x price/lb
 *   sellerGross   = sale - freight - platformFee - shrinkPenalty
 *   buyerRefund   = shrinkPenalty (credited back to the buyer)
 *
 * Invariant: sellerGross + freightFee + platformFee + buyerRefund === sale.
 */
export function computeSettlementBreakdown(input: SettlementInput): SettlementBreakdown {
  const sale = cents(input.saleAmountCents);
  const freight = cents(input.freightFeeCents);
  const platformFee = bpsOf(sale, input.platformFeeBps);

  let shrinkPenalty: Cents = cents(0);
  if (input.deliveredWeightLbs !== null && input.deliveredWeightLbs !== undefined) {
    const shortfall = shrinkLbs(
      input.contractedWeightLbs,
      input.deliveredWeightLbs,
      input.weightTolerancePct,
    );
    if (shortfall > 0) {
      shrinkPenalty = mulRational(cents(shortfall), input.pricePerLbMicros, 1_000_000);
    }
  }

  const sellerGrossRaw = sale - freight - platformFee - shrinkPenalty;
  if (sellerGrossRaw < 0) {
    throw new ValidationError(
      "seller gross would be negative — sale amount cannot cover freight, platform fee and shrink",
      { sale, freight, platformFee, shrinkPenalty },
    );
  }
  const sellerGross = cents(sellerGrossRaw);

  const breakdown: SettlementBreakdown = {
    saleAmountCents: sale,
    freightFeeCents: freight,
    platformFeeCents: platformFee,
    shrinkPenaltyCents: shrinkPenalty,
    sellerGrossCents: sellerGross,
    haulerNetCents: freight,
    buyerRefundCents: shrinkPenalty,
    platformRevenueCents: platformFee,
  };
  assertZeroSumBreakdown(breakdown);
  return breakdown;
}

export function assertZeroSumBreakdown(b: SettlementBreakdown): void {
  const out = b.sellerGrossCents + b.freightFeeCents + b.platformFeeCents + b.buyerRefundCents;
  if (out !== b.saleAmountCents) {
    throw new ValidationError("settlement breakdown does not sum to the sale amount", {
      out,
      sale: b.saleAmountCents,
    });
  }
}

export type DisputeVerdict = "RESOLVED_BUYER_WINS" | "RESOLVED_SELLER_WINS" | "RESOLVED_SPLIT";

export interface SettlementVector {
  buyerRefundCents: Cents;
  sellerPayoutCents: Cents;
  haulerPayoutCents: Cents;
  platformFeeCents: Cents;
}

/**
 * Deterministic binary arbitration logic — the rules engine only ever emits
 * these vectors, which the ledger then executes.
 *
 * BUYER_WINS : buyer refunded everything except hauler freight + platform fee.
 * SELLER_WINS: standard breakdown with no shrink (full weight honored).
 * SPLIT      : remainder after hauler + platform fee split evenly.
 *
 * Invariant: refund + seller + hauler + platform === escrow balance (sale).
 */
export function computeDisputeVector(
  verdict: DisputeVerdict,
  input: SettlementInput,
  breakdown?: SettlementBreakdown,
): SettlementVector {
  const sale = cents(input.saleAmountCents);
  const freight = cents(input.freightFeeCents);
  const platformFee = bpsOf(sale, input.platformFeeBps);

  switch (verdict) {
    case "RESOLVED_BUYER_WINS": {
      const vector: SettlementVector = {
        buyerRefundCents: cents(sale - freight - platformFee),
        sellerPayoutCents: cents(0),
        haulerPayoutCents: freight,
        platformFeeCents: platformFee,
      };
      assertVectorZeroSum(vector, sale);
      return vector;
    }
    case "RESOLVED_SELLER_WINS": {
      const full = breakdown ?? computeSettlementBreakdown({ ...input, deliveredWeightLbs: null });
      const vector: SettlementVector = {
        buyerRefundCents: cents(0),
        sellerPayoutCents: full.sellerGrossCents,
        haulerPayoutCents: full.haulerNetCents,
        platformFeeCents: full.platformFeeCents,
      };
      assertVectorZeroSum(vector, sale);
      return vector;
    }
    case "RESOLVED_SPLIT": {
      const remainder = sale - freight - platformFee;
      const half = cents(roundHalfUp(remainder / 2));
      const vector: SettlementVector = {
        buyerRefundCents: half,
        sellerPayoutCents: cents(remainder - half), // buyer keeps the odd cent
        haulerPayoutCents: freight,
        platformFeeCents: platformFee,
      };
      assertVectorZeroSum(vector, sale);
      return vector;
    }
    default: {
      const _exhaustive: never = verdict;
      throw new ValidationError(`unknown verdict: ${_exhaustive}`);
    }
  }
}

export function assertVectorZeroSum(vector: SettlementVector, saleAmountCents: Cents): void {
  assertNonNegativeCents(vector.buyerRefundCents, "buyerRefundCents");
  assertNonNegativeCents(vector.sellerPayoutCents, "sellerPayoutCents");
  assertNonNegativeCents(vector.haulerPayoutCents, "haulerPayoutCents");
  assertNonNegativeCents(vector.platformFeeCents, "platformFeeCents");
  const total =
    vector.buyerRefundCents +
    vector.sellerPayoutCents +
    vector.haulerPayoutCents +
    vector.platformFeeCents;
  if (total !== saleAmountCents) {
    throw new ValidationError("settlement vector does not sum to the escrow balance", {
      total,
      sale: saleAmountCents,
    });
  }
}
