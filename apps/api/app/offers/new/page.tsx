import { prisma } from "@livestock/db";
import { getDemoUser, getDemoRoles } from "../../../lib/demoAuth";
import { compactMoney } from "../../../lib/format";
import { listingTotalValueCents } from "../../../lib/listingPricing";
import { redirect } from "next/navigation";
import { SubmitOfferForm } from "./SubmitOfferForm";

export const dynamic = "force-dynamic";

const SPECIES_EMOJI: Record<string, string> = {
  CATTLE: "🐄", HOG: "🐷", SHEEP: "🐑", GOAT: "🐐",
};

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const [user, roles] = await Promise.all([getDemoUser(), getDemoRoles()]);
  if (!roles.includes("BUYER")) redirect("/marketplace");

  const { l } = await searchParams;
  const listingIds = l ? l.split(",").filter(Boolean) : [];

  const listings = listingIds.length
    ? await prisma.listing.findMany({
        where: {
          id: { in: listingIds },
          status: { in: ["ACTIVE", "UNDER_OFFER"] },
          sellerId: { not: user.id },
        },
        include: { seller: { select: { id: true, name: true } } },
      })
    : [];

  // Gather available active listings on marketplace for the lot builder
  const activeListings = await prisma.listing.findMany({
    where: { status: { in: ["ACTIVE", "UNDER_OFFER"] }, marketplace: "LIVE", sellerId: { not: user.id } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { seller: { select: { id: true, name: true } } },
  });

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-barn-600/15 via-transparent to-hay-500/15" aria-hidden />
        <div className="relative">
          <p className="section-label text-barn-300">New offer</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
            Make an <span className="text-hay-300">offer</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-300">
            Select listings from the lot builder below, then set your price. Every offer requires seller review first
            — you confirm after they accept. Escrow is created on confirmation.
          </p>
        </div>
      </section>

      <SubmitOfferForm
        initial={listings.map((l) => ({
          id: l.id,
          breed: l.breed,
          species: l.species,
          emoji: SPECIES_EMOJI[l.species] ?? "🐾",
          headCount: l.headCount,
          avgWeightLbs: l.avgWeightLbs,
          pricePerLbCents: l.pricePerLbCents,
          pricePerHeadCents: l.pricePerHeadCents,
          priceType: l.priceType,
          location: l.location,
          seller: l.seller.name ?? "Unknown",
        }))}
        allListings={activeListings.map((l) => ({
          id: l.id,
          breed: l.breed,
          species: l.species,
          emoji: SPECIES_EMOJI[l.species] ?? "🐾",
          headCount: l.headCount,
          avgWeightLbs: l.avgWeightLbs,
          pricePerLbCents: l.pricePerLbCents,
          pricePerHeadCents: l.pricePerHeadCents,
          priceType: l.priceType,
          location: l.location,
          seller: l.seller.name ?? "Unknown",
        }))}
      />
    </div>
  );
}