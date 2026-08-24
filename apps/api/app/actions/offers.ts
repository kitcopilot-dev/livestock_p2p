"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, type OfferPriceType, type OfferStatus } from "@livestock/db";
import { getDemoUser, getDemoRoles } from "../../lib/demoAuth";
import { estimateRouteMiles } from "@livestock/shared";
import { getPlatformSettings } from "../../lib/platformSettings";
import { assertFinancingEligible, financeEscrow } from "../../lib/financing";

export interface OfferActionResult {
  ok: boolean;
  error?: string;
  offerIds?: string[];
  escrowId?: string;
}

function centsFromDollars(dollars: string): number | null {
  const parsed = Number.parseFloat(dollars);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function generateReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `OFF-${result}`;
}

interface SubmitOfferInput {
  listingIds: string[];
  priceType: "PER_HEAD" | "PER_POUND";
  priceDollars: string;
  message: string;
  transportNeeded: boolean;
  destinationFacility: string;
}

export async function submitOfferAction(input: SubmitOfferInput): Promise<OfferActionResult> {
  try {
    const user = await getDemoUser();
    const roles = await getDemoRoles();
    if (!roles.includes("BUYER")) {
      return { ok: false, error: "Only buyers can make offers" };
    }

    const priceCents = centsFromDollars(input.priceDollars);
    if (priceCents === null) {
      return { ok: false, error: "Price must be a positive dollar amount" };
    }
    if (!input.listingIds.length) {
      return { ok: false, error: "At least one listing is required" };
    }

    const listings = await prisma.listing.findMany({
      where: { id: { in: input.listingIds }, sellerId: { not: user.id } },
      include: { seller: { select: { id: true } } },
    });

    const available = listings.filter(
      (l) => l.status === "ACTIVE" || l.status === "UNDER_OFFER",
    );
    if (available.length === 0) {
      return { ok: false, error: "None of the selected listings are available for offers" };
    }

    // Group by seller
    const bySeller = new Map<string, typeof available>();
    for (const l of available) {
      const group = bySeller.get(l.sellerId) ?? [];
      group.push(l);
      bySeller.set(l.sellerId, group);
    }

    const offerIds: string[] = [];

    for (const [sellerId, sellerListings] of bySeller) {
      let totalAmountCents = 0;
      const items: Array<{
        listingId: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
      }> = [];

      for (const listing of sellerListings) {
        const unitPriceCents = priceCents;
        let lineTotal: number;
        let quantity: number;

        if (input.priceType === "PER_HEAD") {
          quantity = listing.headCount;
          lineTotal = unitPriceCents * quantity;
        } else {
          // PER_POUND: quantity = total weight in lbs, unitPriceCents is cents/lb
          quantity = listing.avgWeightLbs * listing.headCount;
          lineTotal = unitPriceCents * quantity;
        }

        totalAmountCents += lineTotal;
        items.push({
          listingId: listing.id,
          quantity,
          unitPriceCents,
          lineTotalCents: lineTotal,
        });
      }

      if (totalAmountCents <= 0) {
        continue;
      }

      const reference = generateReference();

      // Mark listings as UNDER_OFFER within a transaction
      await prisma.$transaction(async (tx) => {
        const offer = await tx.offer.create({
          data: {
            reference,
            buyerId: user.id,
            sellerId,
            status: "PENDING",
            priceType: input.priceType as OfferPriceType,
            totalAmountCents,
            message: input.message || null,
            transportNeeded: input.transportNeeded,
            destinationFacility: input.destinationFacility || null,
            items: {
              create: items,
            },
          },
        });

        await tx.listing.updateMany({
          where: { id: { in: items.map((i) => i.listingId) } },
          data: { status: "UNDER_OFFER" },
        });

        offerIds.push(offer.id);
      });
    }

    revalidatePath("/offers");
    revalidatePath("/marketplace");
    return { ok: true, offerIds };
  } catch (err) {
    if (err instanceof Error && "digest" in err && (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function acceptOfferAction(offerId: string): Promise<OfferActionResult> {
  try {
    const user = await getDemoUser();
    const roles = await getDemoRoles();
    if (!roles.includes("SELLER")) {
      return { ok: false, error: "Only sellers can accept offers" };
    }

    const offer = await prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) return { ok: false, error: "Offer not found" };
    if (offer.sellerId !== user.id) return { ok: false, error: "This offer is not for you" };
    if (offer.status !== "PENDING") return { ok: false, error: `Cannot accept an offer that is ${offer.status.toLowerCase()}` };

    await prisma.offer.update({
      where: { id: offerId },
      data: { status: "ACCEPTED", sellerApprovedAt: new Date() },
    });

    revalidatePath("/offers");
    return { ok: true, offerIds: [offerId] };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function declineOfferAction(offerId: string, reason?: string): Promise<OfferActionResult> {
  try {
    const user = await getDemoUser();
    const roles = await getDemoRoles();
    if (!roles.includes("SELLER")) {
      return { ok: false, error: "Only sellers can decline offers" };
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { items: { select: { listingId: true } } },
    });
    if (!offer) return { ok: false, error: "Offer not found" };
    if (offer.sellerId !== user.id) return { ok: false, error: "This offer is not for you" };
    if (offer.status !== "PENDING") return { ok: false, error: `Cannot decline an offer that is ${offer.status.toLowerCase()}` };

    await prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: offerId },
        data: { status: "DECLINED", declinedReason: reason || null },
      });
      // Return listings to ACTIVE
      await tx.listing.updateMany({
        where: { id: { in: offer.items.map((i) => i.listingId) }, status: "UNDER_OFFER" },
        data: { status: "ACTIVE" },
      });
    });

    revalidatePath("/offers");
    revalidatePath("/marketplace");
    return { ok: true, offerIds: [offerId] };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function confirmOfferAction(
  offerId: string,
  destination?: string,
  financed = false,
): Promise<OfferActionResult> {
  try {
    const user = await getDemoUser();
    const roles = await getDemoRoles();
    if (!roles.includes("BUYER")) {
      return { ok: false, error: "Only buyers can confirm offers" };
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        items: { include: { listing: true } },
        seller: { select: { id: true, name: true } },
      },
    });
    if (!offer) return { ok: false, error: "Offer not found" };
    if (offer.buyerId !== user.id) return { ok: false, error: "This is not your offer" };
    if (offer.status !== "ACCEPTED") return { ok: false, error: `Cannot confirm an offer that is ${offer.status.toLowerCase()}` };

    // Financing eligibility pre-check before anything is created or marked
    // sold — a failed financing choice must not leave listings SOLD.
    if (financed) {
      const eligibilityError = await assertFinancingEligible({
        buyerId: user.id,
        saleAmountCents: offer.totalAmountCents,
      });
      if (eligibilityError) return { ok: false, error: eligibilityError };
    }

    // Pick hauler
    const hauler =
      (await prisma.user.findFirst({ where: { role: "HAULER", email: { not: "demo.hauler@livestock.local" } } })) ??
      (await prisma.user.findFirst({ where: { role: "HAULER" } }));
    if (!hauler) return { ok: false, error: "No hauler available" };

    // Compute escrow amounts
    const saleAmountCents = offer.totalAmountCents;
    // contractedWeightLbs is always headCount * avgWeightLbs regardless of offer price type.
    // For PER_POUND offers, item.quantity is total lbs (not head count), so use the listing fields directly.
    const contractedWeightLbs = offer.items.reduce(
      (sum, item) => sum + item.listing.headCount * item.listing.avgWeightLbs,
      0,
    );
    const platform = await getPlatformSettings();
    const freightFeeCents = Math.round((saleAmountCents * platform.freightFeePct) / 100);
    const platformFeeBps = platform.platformFeeBps;
    const dest = destination || offer.destinationFacility || `Delivery to ${user.name}`;

    // Create the escrow
    const tm = new (await import("@livestock/domain")).TransactionManager();
    const escrow = await tm.createDraft({
      buyerId: user.id,
      sellerId: offer.sellerId,
      haulerId: hauler.id,
      saleAmountCents,
      contractedWeightLbs,
      weightTolerancePct: platform.weightTolerancePct,
      freightFeeCents,
      platformFeeBps,
    });

    // Update offer + listings + create load + decline competing offers
    const listingIds = offer.items.map((i) => i.listingId);
    const firstListing = offer.items[0]!.listing;
    const loadMiles = estimateRouteMiles(firstListing.location, dest);

    await prisma.$transaction(async (tx) => {
      // Confirm this offer
      await tx.offer.update({
        where: { id: offerId },
        data: {
          status: "CONFIRMED",
          buyerConfirmedAt: new Date(),
          escrowId: escrow.id,
          destinationFacility: dest,
        },
      });

      // Mark listings SOLD
      await tx.listing.updateMany({
        where: { id: { in: listingIds } },
        data: { status: "SOLD" },
      });

      // Create transport load if needed
      if (offer.transportNeeded) {
        await tx.load.create({
          data: {
            escrowId: escrow.id,
            origin: firstListing.location,
            destination: dest,
            distanceMiles: loadMiles,
            loadType: firstListing.loadType,
            marketplace: firstListing.marketplace,
            species: firstListing.species,
            headCount: offer.items.reduce((s, i) => s + i.quantity, 0),
            totalWeightLbs: contractedWeightLbs,
            freightPayCents: freightFeeCents,
            posterId: offer.sellerId,
            status: "OPEN",
          },
        });
      }

      // Decline other pending/accepted offers that overlap with these listings
      const competing = await tx.offer.findMany({
        where: {
          id: { not: offerId },
          status: { in: ["PENDING", "ACCEPTED"] },
          items: { some: { listingId: { in: listingIds } } },
        },
        include: { items: { select: { listingId: true } } },
      });

      for (const comp of competing) {
        await tx.offer.update({
          where: { id: comp.id },
          data: { status: "DECLINED", declinedReason: "Listing sold to another buyer" },
        });
      }
    });

    // Deferred payment: convert the draft to a financed escrow (stamps the
    // payment deadline + fee and schedules auto-cancel). Non-financed offers
    // stay DRAFT and are funded later from the escrow detail page.
    if (financed) {
      const res = await financeEscrow(escrow.id, user.id);
      if (!res.ok) return { ok: false, error: res.error };
    }

    revalidatePath("/offers");
    revalidatePath("/marketplace");
    revalidatePath("/escrows");
    revalidatePath("/loads");
    return { ok: true, offerIds: [offerId], escrowId: escrow.id };
  } catch (err) {
    if (err instanceof Error && "digest" in err && (err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { ok: false, error: (err as Error).message };
  }
}

export async function withdrawOfferAction(offerId: string): Promise<OfferActionResult> {
  try {
    const user = await getDemoUser();
    const roles = await getDemoRoles();
    if (!roles.includes("BUYER")) {
      return { ok: false, error: "Only buyers can withdraw offers" };
    }

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: { items: { select: { listingId: true } } },
    });
    if (!offer) return { ok: false, error: "Offer not found" };
    if (offer.buyerId !== user.id) return { ok: false, error: "This is not your offer" };
    if (!["PENDING", "ACCEPTED"].includes(offer.status)) {
      return { ok: false, error: `Cannot withdraw an offer that is ${offer.status.toLowerCase()}` };
    }

    await prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: offerId },
        data: { status: "WITHDRAWN" },
      });
      // Return listings to ACTIVE
      await tx.listing.updateMany({
        where: { id: { in: offer.items.map((i) => i.listingId) }, status: "UNDER_OFFER" },
        data: { status: "ACTIVE" },
      });
    });

    revalidatePath("/offers");
    revalidatePath("/marketplace");
    return { ok: true, offerIds: [offerId] };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}