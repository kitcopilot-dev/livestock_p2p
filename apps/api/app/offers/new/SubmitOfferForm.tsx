"use client";

import { useState, useCallback } from "react";
import { submitOfferAction } from "../../actions/offers";
import { compactMoney } from "../../../lib/format";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────────────────── */

interface ListingMeta {
  id: string;
  breed: string;
  species: string;
  emoji: string;
  headCount: number;
  avgWeightLbs: number;
  pricePerLbCents: number;
  pricePerHeadCents: number | null;
  priceType: string;
  location: string;
}

interface AllListing extends ListingMeta {
  seller: string;
}

interface Props {
  initial: ListingMeta[];
  allListings: AllListing[];
}

/* ── Fee helpers ───────────────────────────────────────────────────── */

const PLATFORM_FEE_BPS = 200; // 2 %
const FEE_DECIMAL = PLATFORM_FEE_BPS / 10_000;

function grossCents(listing: AllListing): number {
  if (listing.priceType === "PER_HEAD" && listing.pricePerHeadCents) {
    return listing.pricePerHeadCents * listing.headCount;
  }
  return listing.pricePerLbCents * listing.avgWeightLbs * listing.headCount;
}

function sellerFeeCents(listing: AllListing): number {
  return Math.round(grossCents(listing) * FEE_DECIMAL);
}

function buyerTotalCents(listing: AllListing): number {
  return grossCents(listing); // buyer pays gross; seller absorbs fee
}

function askingPriceDollars(listing: ListingMeta): string {
  if (listing.priceType === "PER_HEAD" && listing.pricePerHeadCents) {
    return (listing.pricePerHeadCents / 100).toFixed(2);
  }
  return (listing.pricePerLbCents / 100).toFixed(2);
}

/* ── Component ─────────────────────────────────────────────────────── */

export function SubmitOfferForm({ initial, allListings }: Props) {
  const [selected, setSelected] = useState<ListingMeta[]>(initial);
  const [priceType, setPriceType] = useState<"PER_HEAD" | "PER_POUND">(
    initial.length > 0 ? (initial[0]!.priceType as "PER_HEAD" | "PER_POUND") : "PER_HEAD",
  );
  const [priceDollars, setPriceDollars] = useState(
    initial.length > 0 ? askingPriceDollars(initial[0]!) : "",
  );
  const [message, setMessage] = useState("");
  const [transportNeeded, setTransportNeeded] = useState(false);
  const [destination, setDestination] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const toggleListing = useCallback(
    (listing: ListingMeta) => {
      setSelected((prev) => {
        const exists = prev.some((l) => l.id === listing.id);
        if (exists) return prev.filter((l) => l.id !== listing.id);
        const next = [...prev, listing];
        if (prev.length === 0) {
          setPriceType(listing.priceType as "PER_HEAD" | "PER_POUND");
          setPriceDollars(askingPriceDollars(listing));
        }
        return next;
      });
    },
    [],
  );

  /* ── Derived totals ──────────────────────────────────────────────── */

  const totalHeadCount = selected.reduce((s, l) => s + l.headCount, 0);
  const totalWeightLbs = selected.reduce((s, l) => s + l.avgWeightLbs * l.headCount, 0);

  const selectedWithFees = selected.map((sel) => {
    const full = allListings.find((a) => a.id === sel.id)!;
    const gross = grossCents(full);
    const sellerFee = sellerFeeCents(full);
    const buyerTotal = buyerTotalCents(full);
    return { ...full, gross, sellerFee, buyerTotal };
  });

  const totalGross = selectedWithFees.reduce((s, l) => s + l.gross, 0);
  const totalSellerFees = selectedWithFees.reduce((s, l) => s + l.sellerFee, 0);
  const totalBuyerFees = 0; // buyer pays gross
  const totalBuyerTotal = selectedWithFees.reduce((s, l) => s + l.buyerTotal, 0);

  const sellerGroups = new Map<string, { listings: typeof selectedWithFees; headCount: number }>();
  for (const l of selectedWithFees) {
    const existing = sellerGroups.get(l.seller) ?? { listings: [], headCount: 0 };
    existing.listings.push(l);
    existing.headCount += l.headCount;
    sellerGroups.set(l.seller, existing);
  }

  const unitPriceCents = (() => {
    const d = Number.parseFloat(priceDollars);
    return Number.isFinite(d) && d > 0 ? Math.round(d * 100) : 0;
  })();

  const offerTotalCents =
    priceType === "PER_HEAD"
      ? unitPriceCents * totalHeadCount
      : unitPriceCents * totalWeightLbs;

  async function handleSubmit() {
    if (selected.length === 0) {
      setError("Select at least one listing");
      return;
    }
    setPending(true);
    setError(null);
    const result = await submitOfferAction({
      listingIds: selected.map((l) => l.id),
      priceType,
      priceDollars,
      message,
      transportNeeded,
      destinationFacility: destination,
    });
    if (!result.ok) {
      setError(result.error ?? "Failed to submit offer");
      setPending(false);
    }
  }

  /* ── Empty state ─────────────────────────────────────────────────── */

  if (selected.length === 0 && allListings.length > 0) {
    return (
      <div className="space-y-6">
        {/* Lot Builder header */}
        <section className="card card-pad">
          <h2 className="font-display text-base font-bold uppercase tracking-wide text-cream-50">
            Lot Builder
          </h2>
          <p className="mt-1 text-sm text-cream-400">
            Review selected livestock, unavailable listing warnings, fees, and buyer totals.
          </p>
        </section>

        <div className="card card-pad text-center py-12">
          <span className="text-5xl opacity-30">📦</span>
          <p className="mt-4 text-sm text-cream-300">No listings selected yet.</p>
          <p className="mt-1 text-xs text-cream-500">
            Go to the marketplace and click listings to add them to your lot, then return here.
          </p>
          <Link href="/marketplace" className="btn-primary mt-5 inline-flex px-6 py-2.5 text-sm">
            Browse marketplace →
          </Link>
        </div>
      </div>
    );
  }

  /* ── Lot Builder view ────────────────────────────────────────────── */

  if (!showSummary) {
    return (
      <div className="space-y-6">
        {/* Lot Builder header */}
        <section className="card card-pad">
          <h2 className="font-display text-base font-bold uppercase tracking-wide text-cream-50">
            Lot Builder
          </h2>
          <p className="mt-1 text-sm text-cream-400">
            Review selected livestock, unavailable listing warnings, fees, and buyer totals.
          </p>
        </section>

        {/* Status + stats boxes */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "STATUS", value: "draft" },
            { label: "SELECTED", value: String(totalHeadCount) },
            { label: "LISTINGS", value: String(selected.length) },
            { label: "TOTAL", value: compactMoney(totalBuyerTotal) },
          ].map((box) => (
            <div key={box.label} className="card card-pad !py-3 !px-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cream-500">
                {box.label}
              </p>
              <p className="mt-1 font-display text-xl font-bold text-cream-50">
                {box.label === "TOTAL" ? box.value : box.value}
              </p>
            </div>
          ))}
        </div>

        {/* 2% Fees card */}
        <div className="card card-pad">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cream-500">
            {(PLATFORM_FEE_BPS / 100).toFixed(0)}% FEES
          </p>
          <p className="mt-1 font-display text-xl font-bold text-cream-50">
            {compactMoney(totalSellerFees)}
          </p>
          <p className="mt-0.5 text-xs text-cream-400">
            Buyer {compactMoney(totalBuyerFees)} · Seller {compactMoney(totalSellerFees)}
          </p>
        </div>

        {/* Price type + offer price */}
        <section className="card card-pad">
          <h3 className="font-display text-sm font-semibold text-cream-50">Your offer</h3>
          <div className="mt-3 flex gap-2">
            {(["PER_HEAD", "PER_POUND"] as const).map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setPriceType(pt)}
                className={
                  "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all " +
                  (priceType === pt
                    ? "bg-gradient-to-b from-barn-400 to-barn-600 text-on-color shadow-[0_2px_10px_-2px_rgba(201,80,46,0.45)]"
                    : "border border-dirt-600 bg-dirt-800/60 text-cream-300")
                }
              >
                {pt === "PER_HEAD" ? "Per Head" : "Per Pound"}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="section-label">
              Offer price (/{priceType === "PER_HEAD" ? "head" : "lb"})
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-cream-400 text-lg font-bold">$</span>
              <input
                type="number"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className="input !w-32"
                step="0.01"
                min="0"
              />
            </div>
          </label>

          {selected.length > 0 && unitPriceCents > 0 && (
            <div className="mt-4 rounded-lg border border-pasture-500/30 bg-pasture-500/10 px-3 py-2.5">
              <p className="text-sm font-semibold text-pasture-200">
                {priceType === "PER_HEAD" ? "Per-head purchase" : "Per-pound purchase"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-pasture-300">
                Your offer covers {totalHeadCount} head at ${Number(priceDollars).toFixed(2)}/
                {priceType === "PER_HEAD" ? "head" : "lb"} —{" "}
                <span className="font-bold text-pasture-200">{compactMoney(offerTotalCents)} total</span>
              </p>
            </div>
          )}
        </section>

        {/* Selected Listings */}
        <section className="card card-pad">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-cream-50">
            Selected Listings
          </h3>

          <div className="mt-4 space-y-4">
            {selectedWithFees.map((listing) => (
              <div key={listing.id} className="rounded-xl border border-dirt-600 overflow-hidden">
                {/* Listing header row */}
                <div className="flex items-center justify-between bg-dirt-800/70 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-cream-50">
                      {listing.emoji} {listing.breed}
                    </p>
                    <p className="text-[11px] text-cream-500">{listing.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-cream-300">Head: {listing.headCount}</p>
                    <p className="text-sm font-bold text-cream-50">
                      Buyer total: {compactMoney(listing.buyerTotal)}
                    </p>
                  </div>
                </div>

                {/* Fee detail grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 bg-dirt-900/50 px-4 py-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-cream-500">Gross:</span>
                    <span className="tabular-nums text-cream-200">{compactMoney(listing.gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-500">2% fee:</span>
                    <span className="tabular-nums text-cream-200">{compactMoney(listing.sellerFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-500">Buyer fee:</span>
                    <span className="tabular-nums text-cream-200">{compactMoney(totalBuyerFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-500">Seller fee:</span>
                    <span className="tabular-nums text-cream-200">{compactMoney(listing.sellerFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-500">Buyer total:</span>
                    <span className="tabular-nums font-semibold text-cream-100">
                      {compactMoney(listing.buyerTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-500">Seller fee selection:</span>
                    <span className="text-cream-400">full (100% of the 2% fee)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Transport + Destination + Message */}
        <section className="card card-pad">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={transportNeeded}
              onChange={(e) => setTransportNeeded(e.target.checked)}
              className="h-4 w-4 rounded accent-hay-400"
            />
            <span className="text-sm text-cream-200">Transport needed</span>
          </label>
        </section>

        {transportNeeded && (
          <section className="card card-pad">
            <label className="block">
              <span className="section-label">Destination facility</span>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="input mt-1"
              >
                <option value="">Select after seller response</option>
                <option value="Delivery to Dana Buyer">Delivery to Dana Buyer</option>
                <option value="Omaha Stockyards, NE">Omaha Stockyards, NE</option>
                <option value="JBS Greely, CO">JBS Greely, CO</option>
              </select>
            </label>
          </section>
        )}

        <section className="card card-pad">
          <label className="block">
            <span className="section-label">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Example: "Offering $${Number(priceDollars || 0).toFixed(2)}/${
                priceType === "PER_HEAD" ? "head" : "lb"
              }, ${compactMoney(offerTotalCents)} total. Can pick up next week."`}
              className="input mt-2 min-h-20"
              rows={3}
            />
          </label>
        </section>

        <div className="rounded-lg border border-dirt-600 bg-dirt-800/40 px-3 py-2.5 text-xs leading-relaxed text-cream-400">
          This offer requires two approvals to finalize: the seller reviews it first, then you&apos;ll
          give a final confirmation before the deal is locked in.
        </div>

        {error && <p className="text-sm text-barn-300 bg-barn-500/10 rounded-lg px-3 py-2">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3">
          <Link href="/marketplace" className="btn-ghost flex-1 justify-center py-2.5 text-sm">
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            disabled={unitPriceCents <= 0}
            className="btn-ghost flex-1 justify-center py-2.5 text-sm border-cream-400/30"
          >
            Review commitment →
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || unitPriceCents <= 0}
            className="btn-primary flex-1 justify-center py-2.5 text-sm"
          >
            {pending ? "Submitting…" : "Send Offer"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Lot Commitment Summary (printable document preview) ─────────── */

  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}, ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowSummary(false)}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          ← Back to lot builder
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary px-4 py-1.5 text-sm"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Document preview card */}
      <div className="card overflow-hidden print:shadow-none print:border-0">
        {/* Header */}
        <div className="border-b border-dirt-600 px-6 py-5 sm:px-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cream-500">
                Document Preview
              </p>
              <h2 className="mt-1 font-display text-xl font-bold uppercase tracking-wide text-cream-50">
                Lot Commitment Summary
              </h2>
              <p className="mt-0.5 text-xs text-cream-400">
                Lot session &middot; {selected.length} listing{selected.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-cream-400">Generated {dateStr}</p>
              <p className="text-xs font-semibold text-cream-300">Status draft</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 sm:px-8 space-y-6">
          {/* Summary boxes */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "SELECTED HEAD", value: String(totalHeadCount) },
              { label: "ELIGIBLE HEAD", value: String(totalHeadCount) },
              { label: "UNAVAILABLE HEAD", value: "0" },
              { label: "BUYER TOTAL", value: compactMoney(totalBuyerTotal) },
            ].map((box) => (
              <div key={box.label} className="rounded-lg border border-dirt-600 bg-dirt-800/40 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-cream-500">{box.label}</p>
                <p className="mt-1 font-display text-lg font-bold text-cream-50">{box.value}</p>
              </div>
            ))}
          </div>

          {/* Buyer + Logistics side by side */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-base font-bold text-cream-50">Buyer</h3>
              <div className="mt-2 rounded-lg border border-dirt-600 bg-dirt-800/30 px-3 py-2 text-sm text-cream-300">
                Dana Buyer (demo account)
              </div>
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-cream-50">Logistics</h3>
              <div className="mt-2 rounded-lg border border-dirt-600 bg-dirt-800/30 px-3 py-2 text-sm text-cream-400 space-y-0.5">
                <p>Pickup: To be provided</p>
                <p>Pickup date: To be provided</p>
                <p>Delivery: {destination || "To be provided"}</p>
                <p>Delivery date: To be provided</p>
              </div>
            </div>
          </div>

          {/* Bill of Lading listing rows */}
          <div>
            <h3 className="font-display text-base font-bold text-cream-50">
              Bill of lading listing rows
            </h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-dirt-600">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-dirt-600 bg-dirt-800/70">
                    <th className="px-3 py-2 text-left font-semibold text-cream-400">Listing</th>
                    <th className="px-3 py-2 text-left font-semibold text-cream-400">Seller</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Head</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Weight</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Buyer total</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Firm price</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWithFees.map((l, i) => (
                    <tr key={l.id} className={i < selectedWithFees.length - 1 ? "border-b border-dirt-700/50" : ""}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-cream-100">{l.breed}</p>
                        <p className="text-[10px] text-cream-500">{l.id}</p>
                      </td>
                      <td className="px-3 py-2 text-cream-300">{l.seller}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cream-200">{l.headCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cream-200">
                        {l.avgWeightLbs ? `${l.avgWeightLbs.toLocaleString("en-US")} lb` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-cream-100">
                        {compactMoney(l.buyerTotal)}
                      </td>
                      <td className="px-3 py-2 text-right text-cream-400">
                        {unitPriceCents > 0 ? `$${Number(priceDollars).toFixed(2)}/${priceType === "PER_HEAD" ? "hd" : "lb"}` : "Not declared"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fee summary + Seller offer summary */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-display text-base font-bold text-cream-50">Fee summary</h3>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-cream-400">Gross listings</span>
                  <span className="tabular-nums text-cream-200">{compactMoney(totalGross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-400">Buyer fees</span>
                  <span className="tabular-nums text-cream-200">{compactMoney(totalBuyerFees)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-400">Seller fees</span>
                  <span className="tabular-nums text-cream-200">{compactMoney(totalSellerFees)}</span>
                </div>
                <div className="border-t border-dirt-600 pt-1.5 flex justify-between font-bold">
                  <span className="text-cream-100">Buyer total</span>
                  <span className="tabular-nums text-cream-50">{compactMoney(totalBuyerTotal)}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-display text-base font-bold text-cream-50">Seller offer summary</h3>
              <div className="mt-3 space-y-3">
                {[...sellerGroups.entries()].map(([seller, group]) => (
                  <div
                    key={seller}
                    className="rounded-lg border border-dirt-600 bg-dirt-800/30 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-cream-200">{seller}</p>
                    <p className="text-xs text-cream-400">{group.headCount} head</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Itemized listing fees */}
          <div>
            <h3 className="font-display text-base font-bold text-cream-50">Itemized listing fees</h3>
            <div className="mt-3 overflow-x-auto rounded-lg border border-dirt-600">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-dirt-600 bg-dirt-800/70">
                    <th className="px-3 py-2 text-left font-semibold text-cream-400">Listing</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Gross</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Buyer fees</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Seller fees</th>
                    <th className="px-3 py-2 text-right font-semibold text-cream-400">Buyer total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWithFees.map((l, i) => (
                    <tr key={l.id} className={i < selectedWithFees.length - 1 ? "border-b border-dirt-700/50" : ""}>
                      <td className="px-3 py-2 text-cream-200">{l.breed}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cream-200">{compactMoney(l.gross)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cream-200">{compactMoney(totalBuyerFees)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cream-200">{compactMoney(l.sellerFee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-cream-100">
                        {compactMoney(l.buyerTotal)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-dirt-600 bg-dirt-800/40 font-bold">
                    <td className="px-3 py-2 text-cream-100">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums text-cream-100">{compactMoney(totalGross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-cream-100">{compactMoney(totalBuyerFees)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-cream-100">{compactMoney(totalSellerFees)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-cream-50">{compactMoney(totalBuyerTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setShowSummary(false)}
          className="btn-ghost flex-1 justify-center py-2.5 text-sm"
        >
          ← Edit offer
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="btn-primary flex-1 justify-center py-2.5 text-sm"
        >
          {pending ? "Submitting…" : "Submit offer"}
        </button>
      </div>

      {error && <p className="text-sm text-barn-300 bg-barn-500/10 rounded-lg px-3 py-2">{error}</p>}
    </div>
  );
}
