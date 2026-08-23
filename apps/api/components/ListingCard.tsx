"use client";

import Link from "next/link";
import type { Listing, User } from "@livestock/db";
import { compactMoney } from "../lib/format";
import {
  listingTotalValueCents,
  listingUnitPriceCents,
  type ListingUnit,
} from "../lib/listingPricing";
export { listingTotalValueCents, listingUnitPriceCents, type ListingUnit };

const SPECIES_EMOJI: Record<string, string> = {
  CATTLE: "🐄",
  HOG: "🐷",
  SHEEP: "🐑",
  GOAT: "🐐",
};

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  BOXED_BEEF: { emoji: "🥩", label: "Boxed Beef" },
  CARCASS: { emoji: "🍖", label: "Carcass" },
  GROUND_BEEF: { emoji: "🍔", label: "Ground Beef" },
  JERKY: { emoji: "🥓", label: "Jerky" },
  SAUSAGE: { emoji: "🌭", label: "Sausage" },
  DAIRY: { emoji: "🧀", label: "Dairy" },
  OTHER: { emoji: "📦", label: "Other" },
};

const GENDER_LABEL: Record<string, string> = {
  STEER: "Steers",
  HEIFER: "Heifers",
  BULL: "Bulls",
  BARROW: "Barrows",
  GILT: "Gilts",
  WETHER: "Wethers",
  EWE: "Ewes",
  RAM: "Rams",
  MIX: "Mixed",
};

export function ListingCard({
  listing,
  seller,
  unit = "all",
  selectable = false,
  selected = false,
  onToggle,
}: {
  listing: Listing;
  seller: Pick<User, "name" | "id">;
  unit?: ListingUnit;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const isProcessor = listing.marketplace === "PROCESSOR";
  const catMeta = isProcessor ? (CATEGORY_META[listing.category ?? "OTHER"] ?? CATEGORY_META.OTHER) : null;
  const emoji = isProcessor ? (catMeta?.emoji ?? "📦") : (SPECIES_EMOJI[listing.species] ?? "🐾");
  const bannerLabel = isProcessor ? (catMeta?.label ?? "Processed") : listing.species.charAt(0) + listing.species.slice(1).toLowerCase();
  const unitNoun = isProcessor ? "units" : "head";
  const totalValue = listingTotalValueCents(listing);
  const totalWeight = listing.avgWeightLbs * listing.headCount;
  const genderLabel = listing.gender ? (GENDER_LABEL[listing.gender] ?? listing.gender) : null;
  const { cents: unitCents, label: unitLabel } = listingUnitPriceCents(listing, unit);
  const freightEst = Math.round(totalValue * 0.03);
  const buyerTotal = totalValue + freightEst + Math.round(totalValue * 0.025);

  const selectedRing = selected
    ? "ring-2 ring-hay-400/70 border-hay-400/70 shadow-[0_8px_40px_-12px_rgba(224,177,82,0.35)]"
    : "";

  return (
    <div className={`group card relative flex flex-col overflow-hidden transition-all duration-200 hover:border-hay-500/50 hover:shadow-[0_8px_40px_-12px_rgba(224,177,82,0.25)] hover:-translate-y-0.5 ${selectedRing}`}>
      <Link
        href={`/marketplace/${listing.id}`}
        className="absolute inset-0 z-0"
        aria-label={`View ${listing.breed}`}
      />
      {selectable && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle?.();
          }}
          aria-pressed={selected}
          aria-label={selected ? `Remove ${listing.breed} from lot` : `Add ${listing.breed} to lot`}
          className={`absolute left-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-all ${
            selected
              ? "border-hay-400 bg-hay-400 text-ink shadow-[0_2px_10px_-2px_rgba(224,177,82,0.6)]"
              : "border-cream-200/70 bg-dirt-950/80 text-transparent backdrop-blur-sm hover:border-hay-300 hover:text-hay-300/60"
          }`}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Image / banner */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-dirt-800 via-dirt-850 to-dirt-900">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={`${listing.breed} ${bannerLabel.toLowerCase()}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-6xl opacity-30 transition-transform duration-500 group-hover:scale-110">{emoji}</span>
          </div>
        )}
        {/* Load type tag */}
        <span className={`absolute inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider backdrop-blur-sm ${selectable ? "left-12 top-3" : "left-3 top-3"} ${listing.loadType === "FULL_LOAD" ? "border border-denim-400/50 bg-denim-950/85 text-denim-200" : "border border-hay-500/50 bg-dirt-950/85 text-hay-200"}`}>
          {listing.loadType === "FULL_LOAD" ? "⛟ FULL LOAD" : "🚚 LTL"}
        </span>
        {/* Tier tag */}
        <span className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${listing.tier === "REGISTERED" ? "border border-hay-400/60 bg-hay-500/20 text-hay-100" : "border border-cream-500/40 bg-dirt-950/85 text-cream-300"}`}>
          {listing.tier === "REGISTERED" ? "★ Registered" : "Commercial"}
        </span>
        {/* Status */}
        {listing.status === "SOLD" && (
          <span className="absolute bottom-3 right-3 rounded-full bg-pasture-500/90 px-2.5 py-1 text-xs font-bold text-on-color shadow-lg">
            SOLD
          </span>
        )}
        {listing.status === "EXPIRED" && (
          <span className="absolute bottom-3 right-3 rounded-full bg-dirt-600/90 px-2.5 py-1 text-xs font-bold text-cream-400">
            EXPIRED
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Breed + location */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-cream-50 group-hover:text-hay-200 transition-colors">
            {listing.breed}
          </h3>
          <span className="shrink-0 text-right text-xs text-cream-500">
            {listing.location}
          </span>
        </div>

        {/* Specs row */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cream-400">
          <span className="rounded-md bg-dirt-700/60 px-2 py-0.5 font-medium">
            {listing.headCount} {unitNoun}
          </span>
          <span className="rounded-md bg-dirt-700/60 px-2 py-0.5 font-medium">
            {new Intl.NumberFormat("en-US").format(listing.avgWeightLbs)} lb/{unitNoun}
          </span>
          {isProcessor ? (
            <span className="rounded-md bg-dirt-700/60 px-2 py-0.5 font-medium">
              {bannerLabel}
            </span>
          ) : (
            <>
              {genderLabel && (
                <span className="rounded-md bg-dirt-700/60 px-2 py-0.5 font-medium">{genderLabel}</span>
              )}
              {listing.ageRange && (
                <span className="rounded-md bg-dirt-700/60 px-2 py-0.5 font-medium">{listing.ageRange}</span>
              )}
            </>
          )}
        </div>

        {/* Description preview */}
        {listing.description && (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-cream-400">
            {listing.description}
          </p>
        )}

        {/* Price + CTA */}
        <div className="mt-auto flex items-end justify-between border-t border-dirt-700/50 pt-3 mt-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500">Asking price</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-cream-50">
              ${(unitCents / 100).toFixed(2)}<span className="text-xs font-normal text-cream-400">/{unitLabel}</span>
            </p>
            <p className="text-[11px] text-cream-500">
              ~{compactMoney(totalValue)} total · {new Intl.NumberFormat("en-US").format(totalWeight)} lb
            </p>
            <p className="mt-0.5 text-[10px] text-cream-600">
              ≈ {compactMoney(buyerTotal)} with fees
            </p>
          </div>
          {listing.status === "ACTIVE" && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-b from-hay-400 to-hay-500 px-3 py-1.5 text-xs font-bold text-ink shadow-[0_2px_8px_-2px_rgba(224,177,82,0.5)] transition-all group-hover:from-hay-300 group-hover:to-hay-400">
              View →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}