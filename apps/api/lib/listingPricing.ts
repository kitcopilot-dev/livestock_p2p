import type { Listing } from "@livestock/db";

export type ListingUnit = "all" | "head" | "pound";

export function listingTotalValueCents(listing: Listing): number {
  if (listing.priceType === "PER_HEAD" && listing.pricePerHeadCents) {
    return listing.pricePerHeadCents * listing.headCount;
  }
  return listing.pricePerLbCents * listing.avgWeightLbs * listing.headCount;
}

export function listingUnitPriceCents(listing: Listing, unit: ListingUnit = "all"): { cents: number; label: string } {
  if (unit === "pound" || (unit === "all" && listing.priceType === "PER_POUND")) {
    return { cents: listing.pricePerLbCents, label: "lb" };
  }
  if (unit === "head" || (unit === "all" && listing.priceType === "PER_HEAD")) {
    const perHead =
      listing.pricePerHeadCents ??
      Math.round((listing.pricePerLbCents * listing.avgWeightLbs) / 100);
    return { cents: perHead, label: "head" };
  }
  return { cents: listing.pricePerLbCents, label: "lb" };
}
