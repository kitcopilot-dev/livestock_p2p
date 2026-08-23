import { describe, expect, it } from "vitest";
import {
  assertVectorZeroSum,
  computeDisputeVector,
  computeSettlementBreakdown,
} from "../src/splits";
import { ValidationError } from "../src/errors";

const baseInput = {
  saleAmountCents: 100_000_00, // $100,000.00
  contractedWeightLbs: 50_000,
  deliveredWeightLbs: 50_000,
  weightTolerancePct: 2,
  pricePerLbMicros: Math.round((100_000_00 * 1_000_000) / 50_000), // 200_000 micro-cents/lb = $2.00/lb
  freightFeeCents: 50_000_00, // $5,000.00
  platformFeeBps: 250, // 2.5%
};

describe("computeSettlementBreakdown", () => {
  it("splits a full-weight sale exactly", () => {
    const b = computeSettlementBreakdown(baseInput);
    // platform fee 2.5% of $100,000 = $2,500
    expect(b.platformFeeCents).toBe(250_000);
    expect(b.shrinkPenaltyCents).toBe(0);
    expect(b.sellerGrossCents).toBe(100_000_00 - 50_000_00 - 250_000);
    expect(b.haulerNetCents).toBe(50_000_00);
    expect(b.buyerRefundCents).toBe(0);
    // invariant: everything out of escrow sums to the sale
    expect(
      b.sellerGrossCents + b.haulerNetCents + b.platformFeeCents + b.buyerRefundCents,
    ).toBe(100_000_00);
  });

  it("computes the weight-shrink penalty beyond tolerance", () => {
    const b = computeSettlementBreakdown({
      ...baseInput,
      deliveredWeightLbs: 48_000, // 2,000 lbs short
    });
    // tolerance = 2% of 50,000 = 1,000 lbs; shrink = 1,000 lbs @ $2.00 = $2,000
    expect(b.shrinkPenaltyCents).toBe(200_000);
    expect(b.buyerRefundCents).toBe(200_000);
    expect(b.sellerGrossCents).toBe(100_000_00 - 50_000_00 - 250_000 - 200_000);
  });

  it("ignores shrink within tolerance", () => {
    const b = computeSettlementBreakdown({
      ...baseInput,
      deliveredWeightLbs: 49_500,
    });
    expect(b.shrinkPenaltyCents).toBe(0);
  });

  it("ignores shrink when the delivered weight was never verified", () => {
    const b = computeSettlementBreakdown({ ...baseInput, deliveredWeightLbs: null });
    expect(b.shrinkPenaltyCents).toBe(0);
  });

  it("rounds fractional shrink penalties deterministically", () => {
    // $1.00001/lb, 50,001 lbs contracted, 48,500 lbs delivered.
    // tolerance = 2% of 50,001 -> 1,000 lbs; shrink = 501 lbs.
    const b = computeSettlementBreakdown({
      ...baseInput,
      pricePerLbMicros: 100_001_000, // 100_001 cents/lb in micro-cents
      contractedWeightLbs: 50_001,
      deliveredWeightLbs: 48_500,
      saleAmountCents: 50_001_00,
      freightFeeCents: 500_00, // scale freight down for the smaller sale
    });
    // 501 * 100_001_000 / 1_000_000 = 50_100.501 -> roundHalfUp -> 50_101
    expect(b.shrinkPenaltyCents).toBe(50_101);
  });

  it("throws when freight + fees exceed the sale", () => {
    expect(() =>
      computeSettlementBreakdown({ ...baseInput, freightFeeCents: 90_000_00, platformFeeBps: 2_000 }),
    ).toThrowError(ValidationError);
  });
});

describe("computeDisputeVector", () => {
  it("BUYER_WINS refunds everything except freight and platform fee", () => {
    const v = computeDisputeVector("RESOLVED_BUYER_WINS", baseInput);
    expect(v.sellerPayoutCents).toBe(0);
    expect(v.haulerPayoutCents).toBe(50_000_00);
    expect(v.platformFeeCents).toBe(250_000);
    expect(v.buyerRefundCents).toBe(100_000_00 - 50_000_00 - 250_000);
    assertVectorZeroSum(v, 100_000_00);
  });

  it("SELLER_WINS honors full weight (no shrink)", () => {
    const v = computeDisputeVector("RESOLVED_SELLER_WINS", {
      ...baseInput,
      deliveredWeightLbs: 45_000,
    });
    expect(v.sellerPayoutCents).toBe(100_000_00 - 50_000_00 - 250_000);
    expect(v.buyerRefundCents).toBe(0);
    assertVectorZeroSum(v, 100_000_00);
  });

  it("SPLIT splits the remainder after freight and platform fee", () => {
    const v = computeDisputeVector("RESOLVED_SPLIT", baseInput);
    const remainder = 100_000_00 - 50_000_00 - 250_000;
    expect(v.buyerRefundCents + v.sellerPayoutCents).toBe(remainder);
    assertVectorZeroSum(v, 100_000_00);
  });
});
