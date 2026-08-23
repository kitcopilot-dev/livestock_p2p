"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListingCard, listingTotalValueCents, type ListingUnit } from "./ListingCard";
import type { Listing, User } from "@livestock/db";
import { compactMoney } from "../lib/format";

interface LotBuilderProps {
  listings: Array<Listing & { seller: Pick<User, "id" | "name"> }>;
  unit: ListingUnit;
}

export function LotBuilder({ listings, unit }: LotBuilderProps) {
  const [lotMode, setLotMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleListing = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selected.size;
  const totalValue = useMemo(
    () =>
      listings
        .filter((l) => selected.has(l.id))
        .reduce((sum, l) => sum + listingTotalValueCents(l), 0),
    [listings, selected],
  );

  const offerHref = selectedCount > 0 ? `/offers/new?l=${Array.from(selected).join(",")}` : "#";

  return (
    <div>
      {/* Lot building toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-cream-400">
          {lotMode ? (
            <span className="text-pasture-300">🛒 Lot building on — tick listings to combine them into one offer</span>
          ) : (
            <span>Browse individual lots, or enable lot building to bundle several into one offer.</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setLotMode((m) => !m);
            setSelected(new Set());
          }}
          aria-pressed={lotMode}
          className={
            lotMode
              ? "inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-pasture-400 to-pasture-600 px-3.5 py-2 text-sm font-semibold text-on-color shadow-[0_2px_10px_-2px_rgba(92,138,85,0.5)]"
              : "inline-flex items-center gap-2 rounded-lg border border-dirt-600 bg-dirt-800/60 px-3.5 py-2 text-sm font-semibold text-cream-200 hover:border-cream-400/40 hover:text-cream-50"
          }
        >
          🛒 Lot building
          <span
            className={
              "inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors " +
              (lotMode ? "bg-pasture-500" : "bg-dirt-600")
            }
          >
            <span
              className={
                "h-3 w-3 rounded-full bg-cream-50 transition-transform " +
                (lotMode ? "translate-x-3" : "")
              }
            />
          </span>
        </button>
      </div>

      {/* Grid */}
      {listings.length === 0 ? (
        <div className="card py-20 text-center">
          <span className="text-5xl opacity-30">🌾</span>
          <p className="mt-4 text-sm text-cream-400">No listings found for this filter.</p>
          <Link href="/marketplace" className="mt-3 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">
            Clear filters →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              seller={listing.seller}
              unit={unit}
              selectable={lotMode}
              selected={selected.has(listing.id)}
              onToggle={() => toggleListing(listing.id)}
            />
          ))}
        </div>
      )}

      {/* Sticky make-offer bar */}
      {lotMode && (
        <div className="sticky bottom-4 z-30 mt-6">
          <div
            className={
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all " +
              (selectedCount > 0
                ? "border-hay-500/60 bg-dirt-900/95 shadow-[0_8px_40px_-12px_rgba(224,177,82,0.4)]"
                : "border-dirt-600 bg-dirt-900/85")
            }
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-hay-500/20 text-lg">🛒</span>
              <div>
                <p className="text-sm font-semibold text-cream-50">
                  {selectedCount === 0 ? "No lots selected" : selectedCount + " lot" + (selectedCount !== 1 ? "s" : "") + " selected"}
                </p>
                <p className="text-xs text-cream-400">
                  {selectedCount === 0 ? "Toggle listings above to build a bundle." : "Estimated total " + compactMoney(totalValue)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-cream-400 hover:text-cream-100"
                >
                  Clear
                </button>
              )}
              {selectedCount > 0 && (
                <Link
                  href={offerHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-hay-400 to-hay-500 px-4 py-2.5 text-sm font-bold text-ink shadow-[0_2px_10px_-2px_rgba(224,177,82,0.5)] hover:from-hay-300 hover:to-hay-400"
                >
                  Make offer on {selectedCount} lot{selectedCount !== 1 ? "s" : ""} →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}