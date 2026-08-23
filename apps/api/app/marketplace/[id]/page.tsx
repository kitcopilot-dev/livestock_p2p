import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@livestock/db";
import { createEscrowFromListingAction } from "../../actions/listings";
import { getDemoUser, getDemoRole } from "../../../lib/demoAuth";
import { compactMoney, formatDate } from "../../../lib/format";
import { listingTotalValueCents, listingUnitPriceCents } from "../../../lib/listingPricing";
import { getPlatformSettings } from "../../../lib/platformSettings";
import { ListingMediaManager } from "../../../components/ListingMediaManager";

export const dynamic = "force-dynamic";

const SPECIES_EMOJI: Record<string, string> = {
  CATTLE: "🐄", HOG: "🐷", SHEEP: "🐑", GOAT: "🐐",
};

const GENDER_LABEL: Record<string, string> = {
  STEER: "Steers", HEIFER: "Heifers", BULL: "Bulls",
  BARROW: "Barrows", GILT: "Gilts", WETHER: "Wethers",
  EWE: "Ewes", RAM: "Rams", MIX: "Mixed",
};

// ---------------------------------------------------------------------------
// Traditional barn-sale assumptions (industry averages).
// These feed the "platform vs barn" comparison card.
// ---------------------------------------------------------------------------
const BARN = {
  commissionPct: 4.0,   // barn sale commission
  shrinkPct: 3.0,       // weight shrink in transit
  feedCarePerHead: 1800,  // $18.00/head travel feed/care (cents)
  yardagePerHead: 1200,   // $12.00/head yardage (cents)
  freightPerHead: 3500,   // $35.00/head freight (cents)
  handlingPerHead: 800,   // $8.00/head handling (cents)
} as const;

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, role, platform] = await Promise.all([
    getDemoUser(), getDemoRole(), getPlatformSettings(),
  ]);

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, email: true, kycStatus: true } },
      documents: { orderBy: { uploadedAt: "asc" } },
    },
  });

  if (!listing) notFound();
  await prisma.listing.update({ where: { id }, data: { viewCount: { increment: 1 } } });

  const emoji = SPECIES_EMOJI[listing.species] ?? "🐾";
  const genderLabel = listing.gender ? (GENDER_LABEL[listing.gender] ?? listing.gender) : null;
  const totalValue = listingTotalValueCents(listing);
  const totalWeight = listing.avgWeightLbs * listing.headCount;
  const { cents: unitCents, label: unitLabel } = listingUnitPriceCents(listing, "all");
  const isProcessor = listing.marketplace === "PROCESSOR";
  const unitNoun = isProcessor ? "units" : "head";
  const categoryLabel = isProcessor ? (listing.category ?? "OTHER").replace(/_/g, " ").toLowerCase() : null;
  const isOwner = user.id === listing.sellerId;
  const canBuy = role === "BUYER" && listing.status === "ACTIVE" && !isOwner;
  const headCount = listing.headCount;

  // --- Fee breakdown ---
  const platformFeeBps = platform.platformFeeBps;
  const listingFeeRate = 200; // 2% listing fee in bps
  const listingFeeCents = Math.round((totalValue * listingFeeRate) / 10000);
  const buyerFeeCents = 0; // platform model: buyer fee is $0
  const sellerFeeCents = listingFeeCents;
  const sellerNet = totalValue - sellerFeeCents;

  // Commission influence: the per-head platform fee contribution
  const commissionPerHeadCents = Math.round(listingFeeCents / headCount);

  // --- Barn comparison ---
  const barnShrinkLoss = Math.round((totalValue * BARN.shrinkPct) / 100);
  const barnCommission = Math.round((totalValue * BARN.commissionPct) / 100);
  const barnYardage = BARN.yardagePerHead * headCount;
  const barnFreight = BARN.freightPerHead * headCount;
  const barnFeedCare = BARN.feedCarePerHead * headCount;
  const barnHandling = BARN.handlingPerHead * headCount;
  const barnTotalDeductions = barnShrinkLoss + barnCommission + barnYardage + barnFreight + barnFeedCare + barnHandling;
  const barnNet = totalValue - barnTotalDeductions;
  const platformVsBarnDiff = sellerNet - barnNet; // how much more the seller keeps on our platform

  const marketplaceHref = isProcessor ? "/marketplace/processor" : "/marketplace";

  // Per-unit price in cents for the top display
  const perUnitCents = listing.priceType === "PER_HEAD" && listing.pricePerHeadCents
    ? listing.pricePerHeadCents
    : listing.pricePerLbCents;
  const perUnitLabel = listing.priceType === "PER_HEAD" ? "head" : "lb";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={marketplaceHref} className="text-sm font-medium text-cream-400 hover:text-cream-200">
          &larr; {isProcessor ? "Processor marketplace" : "Marketplace"}
        </Link>
        <span className="text-cream-600">/</span>
        <span className="text-sm text-cream-300">{listing.breed}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ---- LEFT COLUMN ---- */}
        <div className="space-y-5 lg:col-span-2">
          {/* Hero banner */}
          <section className="card overflow-hidden">
            <div className="relative h-64 sm:h-80 bg-gradient-to-br from-dirt-800 via-dirt-850 to-dirt-900">
              {listing.imageUrl ? (
                <img src={listing.imageUrl} alt={listing.breed} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-[8rem] opacity-20">{emoji}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-dirt-950/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-5 right-5">
                <div className="flex flex-wrap items-center gap-2">
                  {isProcessor && categoryLabel && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-barn-400/50 bg-barn-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-barn-200 backdrop-blur-sm">🥩 {categoryLabel}</span>
                  )}
                  {!isProcessor && (
                    <>
                      {listing.loadType === "FULL_LOAD" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-denim-400/50 bg-denim-950/80 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-denim-200 backdrop-blur-sm">⛟ FULL LOAD</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-hay-500/50 bg-dirt-950/80 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-hay-200 backdrop-blur-sm">🚚 LTL</span>
                      )}
                    </>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${listing.tier === "REGISTERED" ? "border border-hay-400/60 bg-hay-500/25 text-hay-100" : "border border-cream-500/40 bg-dirt-950/80 text-cream-300"}`}>
                    {listing.tier === "REGISTERED" ? "★ Registered" : "Commercial"}
                  </span>
                  {isProcessor && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wider backdrop-blur-sm ${
                      listing.status === "ACTIVE" ? "border border-pasture-500/60 bg-pasture-500/20 text-pasture-200" :
                      listing.status === "UNDER_OFFER" ? "border border-hay-500/60 bg-hay-500/20 text-hay-200" : "border border-dirt-600 bg-dirt-800/70 text-cream-400"
                    }`}>
                      {listing.status === "ACTIVE" ? "Available" : listing.status.replace("_", " ").toLowerCase()}
                    </span>
                  )}
                </div>
                <h1 className="mt-1.5 font-display text-2xl font-bold text-cream-50 sm:text-3xl">{listing.breed}</h1>
              </div>
            </div>
          </section>

          {/* About this lot */}
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-hay-400" />
              About this lot
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-cream-300 whitespace-pre-line">
              {listing.description || "No description provided."}
            </p>
          </section>

          {/* Photos + documents (owner can upload; everyone sees gallery/docs) */}
          <ListingMediaManager
            listingId={listing.id}
            isOwner={isOwner}
            galleryUrls={listing.galleryUrls}
            documents={listing.documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              url: d.url,
              kind: d.kind,
            }))}
          />

          {/* Listing specifications — physical */}
          {!isProcessor && (
            <section className="card card-pad">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
                <span className="h-2 w-2 rounded-full bg-denim-400" />
                Lot specifications
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <SpecCell label="Head count" value={String(headCount)} />
                <SpecCell label="Avg weight" value={new Intl.NumberFormat("en-US").format(listing.avgWeightLbs) + " lb"} />
                <SpecCell label="Total weight" value={new Intl.NumberFormat("en-US").format(totalWeight) + " lb"} />
                {genderLabel && <SpecCell label="Gender" value={genderLabel} />}
                {listing.ageRange && <SpecCell label="Age range" value={listing.ageRange} />}
                {listing.healthStatus && <SpecCell label="Health" value={listing.healthStatus} />}
                <SpecCell label="Location" value={listing.location} />
                {listing.zipCode && <SpecCell label="ZIP code" value={listing.zipCode} />}
                <SpecCell label="Listed" value={formatDate(listing.createdAt)} />
                <SpecCell label="Views" value={String(listing.viewCount)} />
              </div>
            </section>
          )}
          {isProcessor && (
            <section className="card card-pad">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
                <span className="h-2 w-2 rounded-full bg-denim-400" />
                Product specifications
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <SpecCell label="Units" value={String(headCount)} />
                <SpecCell label="Avg unit weight" value={new Intl.NumberFormat("en-US").format(listing.avgWeightLbs) + " lb"} />
                <SpecCell label="Total weight" value={new Intl.NumberFormat("en-US").format(totalWeight) + " lb"} />
                {categoryLabel && <SpecCell label="Category" value={categoryLabel} />}
                <SpecCell label="Location" value={listing.location} />
                {listing.zipCode && <SpecCell label="ZIP code" value={listing.zipCode} />}
                <SpecCell label="Listed" value={formatDate(listing.createdAt)} />
                <SpecCell label="Views" value={String(listing.viewCount)} />
              </div>
            </section>
          )}

          {/* Cattle / livestock classification fields */}
          {!isProcessor && (
            <section className="card card-pad">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
                <span className="h-2 w-2 rounded-full bg-hay-400" />
                {listing.species === "CATTLE" ? "Cattle fields" : listing.species.charAt(0) + listing.species.slice(1).toLowerCase() + " fields"}
              </h2>
              <div className="mt-3 divide-y divide-dirt-700/50">
                <SpecRow label="Origin" value={listing.origin ?? "—"} />
                <SpecRow label="Registry" value={listing.registry ?? "—"} />
                <SpecRow label="Breed" value={listing.breed} />
                <SpecRow label="Species" value={listing.species.charAt(0) + listing.species.slice(1).toLowerCase()} />
                <SpecRow label="Main category" value={listing.tier === "REGISTERED" ? "Registered" : "Commercial"} />
                <SpecRow label="Class" value={listing.listingClass ?? "—"} />
                {listing.subclass && <SpecRow label="Subclass" value={listing.subclass} />}
                {listing.harvest && <SpecRow label="Harvest" value={listing.harvest} />}
                <SpecRow label="Husbandry" value={listing.husbandry ?? "—"} />
                <SpecRow label="Frame" value={listing.frame ?? "—"} />
                <SpecRow label="Health" value={listing.healthStatus ?? "—"} />
                <SpecRow label="Weight" value={listing.avgWeightLbs ? new Intl.NumberFormat("en-US").format(listing.avgWeightLbs) + " lb" : "—"} />
                <SpecRow label="Vaccines" value={listing.vaccines ?? "Not provided"} />
                <SpecRow label="Condition" value={listing.condition ?? "—"} />
                <SpecRow label="Fertility" value={listing.fertility ?? "—"} />
                <SpecRow label="Registry type" value={listing.registryType ?? "—"} />
                <SpecRow label="Age range" value={listing.ageRange ?? "—"} />
                {listing.birthWeightLbs && <SpecRow label="Birth weight" value={listing.birthWeightLbs + " lb"} />}
              </div>
            </section>
          )}

          {/* Listing specifications — pricing fields (the WGB-style table) */}
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-hay-400" />
              Listing specifications
            </h2>
            <p className="mt-1 section-label">Pricing fields</p>
            <div className="mt-3 divide-y divide-dirt-700/50">
              <SpecRow label={listing.priceType === "PER_HEAD" ? "Price / Head" : "Price / lb"} value={"$" + (perUnitCents / 100).toFixed(2)} />
              <SpecRow label="Quantity" value={isProcessor ? String(headCount) + " units" : String(headCount) + " head"} />
              <SpecRow label="Total price" value={compactMoney(totalValue)} bold />
              <SpecRow label="2% Listing Fee" value={compactMoney(listingFeeCents)} />
              <SpecRow label="Buyer Fee" value={compactMoney(buyerFeeCents)} />
              <SpecRow label="Seller Fee" value={compactMoney(sellerFeeCents)} />
              <SpecRow label="Seller net" value={compactMoney(sellerNet)} bold accent="pasture" />
              <SpecRow label="Listing type" value={listing.priceType === "PER_HEAD" ? "Flat-Fee" : "Per-lb"} />
              <SpecRow label="Sale type" value="All" />
              <SpecRow label="Price type" value={listing.priceType === "PER_HEAD" ? "Per Head" : "Per Pound"} />
              <SpecRow label="Status" value={listing.status === "ACTIVE" ? "Available" : listing.status.replace(/_/g, " ").toLowerCase()} />
            </div>
          </section>

          {/* Platform vs barn comparison */}
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-pasture-400" />
              Transaction value comparison
            </h2>
            <p className="mt-1 text-xs text-cream-500">See how much more value the platform delivers vs a traditional barn sale.</p>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Platform column */}
              <div>
                <h3 className="font-display text-sm font-semibold text-hay-200">Platform transaction</h3>
                <div className="mt-3 divide-y divide-dirt-700/50 rounded-lg border border-dirt-600 overflow-hidden">
                  <CompRow label="Commission type" value={listing.priceType === "PER_HEAD" ? "Flat Fee Per Head" : "Per-lb"} />
                  <CompRow label="Marketplace fee" value={(listingFeeRate / 100).toFixed(1) + "% of gross listing value"} />
                  <CompRow label="Commission influence" value={compactMoney(commissionPerHeadCents) + " per " + unitNoun} />
                  <CompRow label="Seller contribution" value="Full" />
                  <CompRow label={"Price per " + unitNoun + " + fees"} value={"$" + ((perUnitCents + commissionPerHeadCents) / 100).toFixed(2)} />
                  <CompRow label="Commission fee" value={compactMoney(listingFeeCents)} />
                  <CompRow label="Seller pays" value={compactMoney(sellerFeeCents)} />
                  <CompRow label="Buyer pays" value={compactMoney(buyerFeeCents)} />
                  <CompRow label="Total price" value={compactMoney(totalValue)} />
                  <div className="flex items-center justify-between px-3 py-2.5 bg-dirt-950">
                    <span className="text-sm font-bold text-cream-50">Net total</span>
                    <span className="tabular-nums text-sm font-bold text-cream-50">{compactMoney(sellerNet)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 bg-hay-500/20">
                    <span className="text-xs font-semibold text-hay-200">Traditional barn net</span>
                    <span className="tabular-nums text-xs font-semibold text-hay-200">{compactMoney(barnNet)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 bg-pasture-500/20">
                    <span className="text-xs font-semibold text-pasture-200">Transaction value available for negotiation</span>
                    <span className="tabular-nums text-xs font-bold text-pasture-200">{compactMoney(platformVsBarnDiff)}</span>
                  </div>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-cream-600">
                  Seller options: None (0%), Partial (50%), or Full (100%) contribution to the {listingFeeRate / 100}% listing fee.{" "}
                  Estimated transaction value to be negotiated with buyer based on traditional barn sale estimate.
                  Actual buyer credit will be determined at checkout and may differ from this estimate.
                </p>
              </div>

              {/* Barn column */}
              <div>
                <h3 className="font-display text-sm font-semibold text-cream-300">Traditional barn sale (estimate)</h3>
                <p className="mt-1 text-[11px] text-cream-500">Barn estimate assumptions</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-dirt-600 bg-dirt-800/50 p-3">
                  <div className="flex items-center justify-between text-xs"><span className="text-cream-500">Commission</span><span className="tabular-nums text-cream-200">{BARN.commissionPct.toFixed(1)}%</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-cream-500">Yardage</span><span className="tabular-nums text-cream-200">${(BARN.yardagePerHead / 100).toFixed(2)}/{unitNoun}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-cream-500">Shrink</span><span className="tabular-nums text-cream-200">{BARN.shrinkPct.toFixed(1)}%</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-cream-500">Freight</span><span className="tabular-nums text-cream-200">${(BARN.freightPerHead / 100).toFixed(2)}/{unitNoun}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-cream-500">Feed/Care</span><span className="tabular-nums text-cream-200">${(BARN.feedCarePerHead / 100).toFixed(2)}/{unitNoun}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-cream-500">Handling</span><span className="tabular-nums text-cream-200">${(BARN.handlingPerHead / 100).toFixed(2)}/{unitNoun}</span></div>
                </div>
                <div className="mt-3 divide-y divide-dirt-700/50 rounded-lg border border-dirt-600 overflow-hidden">
                  <CompRow label="Gross listing value" value={compactMoney(totalValue)} />
                  <CompRow label="Shrink loss value" value={compactMoney(-barnShrinkLoss)} accent="barn" />
                  <CompRow label="Barn commission fee" value={compactMoney(-barnCommission)} accent="barn" />
                  <CompRow label="Barn yardage fee" value={compactMoney(-barnYardage)} accent="barn" />
                  <CompRow label="Freight cost" value={compactMoney(-barnFreight)} accent="barn" />
                  <CompRow label="Travel feed/care" value={compactMoney(-barnFeedCare)} accent="barn" />
                  <CompRow label="Handling loss" value={compactMoney(-barnHandling)} accent="barn" />
                  <div className="flex items-center justify-between px-3 py-2 bg-dirt-800/60">
                    <span className="text-xs text-cream-400">Net value difference</span>
                    <span className="tabular-nums text-xs font-semibold text-pasture-300">{compactMoney(platformVsBarnDiff)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-dirt-800/60 border-t border-dirt-700/50">
                    <span className="text-xs text-cream-400">Estimated barn net</span>
                    <span className="tabular-nums text-xs text-cream-300">{compactMoney(barnNet)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 bg-dirt-950">
                    <span className="text-sm font-bold text-cream-50">Final traditional barn net earning</span>
                    <span className="tabular-nums text-sm font-bold text-cream-50">{compactMoney(barnNet)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How buying works */}
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-pasture-400" />
              How buying works
            </h2>
            <div className="mt-4 space-y-3">
              {[
                { step: "1", title: "Funds locked in escrow", desc: "Your payment is held by the platform until inspection clears.", color: "bg-denim-400" },
                { step: "2", title: "Hauler picks up & delivers", desc: "A verified hauler transports the livestock to your location.", color: "bg-hay-400" },
                { step: "3", title: "24-hour inspection window", desc: "You have 24 hours to inspect and file a dispute if needed.", color: "bg-barn-400" },
                { step: "4", title: "Funds released", desc: "If inspection clears, funds auto-release. Disputes go to arbitration.", color: "bg-pasture-400" },
              ].map(({ step, title, desc, color }) => (
                <div key={step} className="flex items-start gap-3">
                  <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full " + color + " text-xs font-bold text-ink"}>{step}</span>
                  <div>
                    <p className="text-sm font-semibold text-cream-100">{title}</p>
                    <p className="text-xs text-cream-400">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ---- RIGHT COLUMN ---- */}
        <div className="space-y-4">
          {/* Asking price card */}
          <section className="card relative overflow-hidden p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hay-400 to-hay-500" />
            <p className="section-label text-hay-300">Asking price</p>
            <p className="mt-2 font-mono text-3xl font-bold text-cream-50">
              {"$" + (perUnitCents / 100).toFixed(2)}
              <span className="text-sm font-normal text-cream-400">/{perUnitLabel}</span>
            </p>
            <div className="mt-4 space-y-2.5 border-t border-dirt-700/70 pt-4">
              <PriceRow label={isProcessor ? "Units" : "Head count"} value={String(headCount)} />
              <PriceRow label="Avg weight" value={new Intl.NumberFormat("en-US").format(listing.avgWeightLbs) + " lb"} />
              <PriceRow label="Total weight" value={new Intl.NumberFormat("en-US").format(totalWeight) + " lb"} />
              <div className="border-t border-dirt-700/70 pt-2.5">
                <PriceRow label="Sale amount" value={compactMoney(totalValue)} bold />
                <PriceRow label="Listing fee (2%)" value={compactMoney(listingFeeCents)} />
                <PriceRow label="Seller net" value={compactMoney(sellerNet)} bold accent="text-pasture-200" />
              </div>
              <div className="rounded-lg border border-denim-500/30 bg-denim-500/10 px-3 py-2">
                <PriceRow label="Buyer pays" value={compactMoney(totalValue)} bold accent="text-denim-200" />
                <p className="mt-0.5 text-[10px] text-denim-300">$0 buyer fees — you only pay the listing price.</p>
              </div>
            </div>
            {canBuy && (
              <div className="space-y-2">
                <Link href={`/offers/new?l=${listing.id}`} className="btn-ghost w-full justify-center py-3 text-base">
                  ✏️ Make an offer
                </Link>
                <form action={async () => { "use server"; await createEscrowFromListingAction(listing.id); }} className="mt-2">
                  <button type="submit" className="btn-primary w-full py-3 text-base">Buy now &mdash; escrow protected</button>
                </form>
                <p className="mt-2 text-center text-[10px] text-cream-500">Buy now creates and funds an escrow instantly. Make an offer lets you negotiate price.</p>
              </div>
            )}
            {isOwner && (
              <div className="mt-5 rounded-xl border border-pasture-500/30 bg-pasture-500/10 p-3 text-center">
                <p className="text-sm font-medium text-pasture-200">This is your listing</p>
                <Link href="/seller" className="mt-1 inline-block text-xs font-medium text-hay-300 hover:text-hay-200">Manage in seller dashboard &rarr;</Link>
              </div>
            )}
            {!canBuy && !isOwner && listing.status === "ACTIVE" && (
              <p className="mt-4 text-center text-xs text-cream-500">Switch to the Buyer role to purchase this lot.</p>
            )}
            {listing.status === "UNDER_OFFER" && (
              <div className="mt-5 rounded-xl border border-hay-500/30 bg-hay-500/10 p-3 text-center">
                <p className="text-sm font-medium text-hay-200">Offer pending</p>
                <p className="mt-1 text-xs text-cream-500">Someone has made an offer on this lot.</p>
              </div>
            )}
            {listing.status !== "ACTIVE" && listing.status !== "UNDER_OFFER" && (
              <div className="mt-5 rounded-xl border border-dirt-600 bg-dirt-800/60 p-3 text-center">
                <p className="text-sm font-medium text-cream-300">{listing.status === "SOLD" ? "This lot has been sold" : "This listing is no longer active"}</p>
              </div>
            )}
          </section>

          {/* Seller */}
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-pasture-400" />
              Seller
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pasture-500/40 bg-pasture-500/25 font-display text-sm font-semibold text-pasture-300">
                {(listing.seller.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-cream-100">{listing.seller.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={"inline-block h-1.5 w-1.5 rounded-full " + (listing.seller.kycStatus === "APPROVED" ? "bg-pasture-400" : "bg-cream-500")} />
                  <span className="text-xs text-cream-500">KYC {listing.seller.kycStatus === "APPROVED" ? "verified" : listing.seller.kycStatus.toLowerCase()}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Buyer protection */}
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-barn-400" />
              Buyer protection
            </h2>
            <ul className="mt-3 space-y-2">
              {[
                "Funds held in escrow until inspection clears",
                "24-hour inspection window after delivery",
                "Programmatic arbitration with evidence review",
                "Double-entry ledger — every cent tracked",
                "USDA Packers & Stockyards Act compliant",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-cream-300">
                  <span className="mt-0.5 text-pasture-400">&#10003;</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---- Shared components ---- */

function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dirt-700/70 bg-dirt-950/40 p-3">
      <p className="section-label">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-cream-100">{value}</p>
    </div>
  );
}

function SpecRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  const accentColor = accent === "barn" ? "text-barn-300" : accent === "pasture" ? "text-pasture-300" : "";
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs font-semibold text-cream-400">{label}</span>
      <span className={"tabular-nums text-sm " + (bold ? "font-bold text-cream-50" : "font-medium text-cream-200") + (accentColor ? " " + accentColor : "")}>{value}</span>
    </div>
  );
}

function CompRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const accentColor = accent === "barn" ? "text-barn-300" : "";
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-[11px] text-cream-500">{label}</span>
      <span className={"tabular-nums text-xs font-semibold text-cream-100" + (accentColor ? " " + accentColor : "")}>{value}</span>
    </div>
  );
}

function PriceRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-cream-500">{label}</span>
      <span className={"text-sm tabular-nums " + (bold ? "font-bold text-cream-50" : "font-medium text-cream-200") + (accent ? " " + accent : "")}>{value}</span>
    </div>
  );
}