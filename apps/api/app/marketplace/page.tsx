import Link from "next/link";
import { prisma, type Species, type Gender, type ListingTier } from "@livestock/db";
import { listingUnitPriceCents, type ListingUnit } from "../../lib/listingPricing";
import { LotBuilder } from "../../components/LotBuilder";
import { MarketplaceFilters } from "./MarketplaceFilters";

export const dynamic = "force-dynamic";

const SPECIES_FILTERS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "", label: "All", emoji: "🌾" },
  { value: "CATTLE", label: "Cattle", emoji: "🐄" },
  { value: "HOG", label: "Hogs", emoji: "🐷" },
  { value: "SHEEP", label: "Sheep", emoji: "🐑" },
  { value: "GOAT", label: "Goats", emoji: "🐐" },
];

const UNIT_OPTIONS: Array<{ value: ListingUnit; label: string }> = [
  { value: "all", label: "All" },
  { value: "head", label: "Per head" },
  { value: "pound", label: "Per lb" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "weight", label: "Heaviest" },
  { value: "head_asc", label: "Fewest head" },
  { value: "head_desc", label: "Most head" },
];

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{
    species?: string;
    sort?: string;
    status?: string;
    unit?: string;
    load?: string;
    q?: string;
    gender?: string;
    tier?: string;
    location?: string;
    minPrice?: string;
    maxPrice?: string;
    minHead?: string;
    maxHead?: string;
  }>;
}) {
  const params = await searchParams;
  const species = (params.species ?? "") as Species | "";
  const sort = params.sort ?? "newest";
  const status = params.status ?? "ACTIVE";
  const unit = (params.unit ?? "all") as ListingUnit;
  const load = params.load ?? "";
  const q = params.q?.trim() ?? "";
  const gender = (params.gender ?? "") as Gender | "";
  const tier = (params.tier ?? "") as ListingTier | "";
  const location = params.location?.trim() ?? "";
  const minPrice = params.minPrice ? parseInt(params.minPrice) : null;
  const maxPrice = params.maxPrice ? parseInt(params.maxPrice) : null;
  const minHead = params.minHead ? parseInt(params.minHead) : null;
  const maxHead = params.maxHead ? parseInt(params.maxHead) : null;

  // Build where clause
  const where: Record<string, unknown> = { marketplace: "LIVE" };
  if (species) where.species = species;
  if (status) where.status = status;
  if (load) where.loadType = load;
  if (gender) where.gender = gender;
  if (tier) where.tier = tier;
  if (location) {
    where.location = { contains: location, mode: "insensitive" };
  }
  if (q) {
    where.OR = [
      { breed: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  // Price range filter
  if (minPrice !== null || maxPrice !== null) {
    const priceConditions: Record<string, unknown>[] = [];
    if (minPrice !== null) priceConditions.push({ pricePerLbCents: { gte: minPrice } });
    if (maxPrice !== null) priceConditions.push({ pricePerLbCents: { lte: maxPrice } });
    if (priceConditions.length === 1) Object.assign(where, priceConditions[0]);
    else if (priceConditions.length > 1) where.AND = priceConditions;
  }

  // Head count range filter
  if (minHead !== null || maxHead !== null) {
    const headConditions: Record<string, unknown>[] = [];
    if (minHead !== null) headConditions.push({ headCount: { gte: minHead } });
    if (maxHead !== null) headConditions.push({ headCount: { lte: maxHead } });
    if (headConditions.length === 1) Object.assign(where, headConditions[0]);
    else if (headConditions.length > 1) where.AND = headConditions;
  }

  const baseOrderBy: Record<string, string> =
    sort === "weight" ? { avgWeightLbs: "desc" } : { createdAt: "desc" };

  const listings = await prisma.listing.findMany({
    where,
    orderBy: baseOrderBy,
    include: { seller: { select: { id: true, name: true } } },
  });

  // Sort by unit price or head count if needed
  const sorted = [...listings];
  if (sort === "price_asc") {
    sorted.sort((a, b) => listingUnitPriceCents(a, unit).cents - listingUnitPriceCents(b, unit).cents);
  } else if (sort === "price_desc") {
    sorted.sort((a, b) => listingUnitPriceCents(b, unit).cents - listingUnitPriceCents(a, unit).cents);
  } else if (sort === "head_asc") {
    sorted.sort((a, b) => a.headCount - b.headCount);
  } else if (sort === "head_desc") {
    sorted.sort((a, b) => b.headCount - a.headCount);
  }

  // Get stats
  const stats = await prisma.listing.groupBy({
    by: ["species"],
    where: { marketplace: "LIVE", status: "ACTIVE" },
    _count: { _all: true },
    _sum: { headCount: true },
  });

  const totalActive = stats.reduce((n, s) => n + s._count._all, 0);
  const totalHead = stats.reduce((n, s) => n + (s._sum.headCount ?? 0), 0);

  // Get unique locations for the location filter
  const allLocations = await prisma.listing.findMany({
    where: { marketplace: "LIVE", status: "ACTIVE" },
    select: { location: true },
    distinct: ["location"],
  });
  const locationOptions = allLocations.map((l) => l.location).sort();

  // Build href helper
  function buildHref(overrides: Record<string, string>): string {
    const sp = new URLSearchParams();
    const base: Record<string, string> = { status: "ACTIVE" };
    if (species) base.species = species;
    if (sort !== "newest") base.sort = sort;
    if (unit !== "all") base.unit = unit;
    if (load) base.load = load;
    if (q) base.q = q;
    if (gender) base.gender = gender;
    if (tier) base.tier = tier;
    if (location) base.location = location;
    if (minPrice !== null) base.minPrice = String(minPrice);
    if (maxPrice !== null) base.maxPrice = String(maxPrice);
    if (minHead !== null) base.minHead = String(minHead);
    if (maxHead !== null) base.maxHead = String(maxHead);
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    return `/marketplace?${sp.toString()}`;
  }

  // Count active filters
  const activeFilterCount = [
    species,
    gender,
    tier,
    location,
    minPrice !== null,
    maxPrice !== null,
    minHead !== null,
    maxHead !== null,
    q,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1.5">
        <Link href="/marketplace" className="rounded-lg bg-gradient-to-b from-hay-400 to-hay-500 px-3 py-1.5 text-sm font-bold text-ink shadow-[0_2px_8px_-2px_rgba(224,177,82,0.4)]">
          🐄 Live animals
        </Link>
        <Link href="/marketplace/processor" className="rounded-lg border border-dirt-600 bg-dirt-800/60 px-3 py-1.5 text-sm font-medium text-cream-300 hover:text-cream-100">
          🥩 Processed goods
        </Link>
      </div>

      {/* Hero */}
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-pasture-600/20 via-transparent to-hay-500/15" aria-hidden />
        <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-barn-400/8 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="section-label text-pasture-300">Livestock Marketplace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
            Browse <span className="text-hay-300">available lots</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-300">
            Escrow-protected transactions. Buyer funds are locked until delivery inspection clears.
            Every deal runs on our state machine with programmatic arbitration.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <StatMini label="Active lots" value={String(totalActive)} />
            <StatMini label="Head available" value={new Intl.NumberFormat("en-US").format(totalHead)} />
            <StatMini label="Protected" value="100%" accent="text-pasture-300" />
          </div>
        </div>
      </section>

      {/* Search + Sort Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <form action="/marketplace" method="get" className="flex items-center gap-2">
          <input type="hidden" name="status" value="ACTIVE" />
          {species && <input type="hidden" name="species" value={species} />}
          {gender && <input type="hidden" name="gender" value={gender} />}
          {tier && <input type="hidden" name="tier" value={tier} />}
          {load && <input type="hidden" name="load" value={load} />}
          {location && <input type="hidden" name="location" value={location} />}
          <input type="search" name="q" defaultValue={q} placeholder="Search breed, location, description…" className="input !w-72" />
          <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">Search</button>
        </form>
        <div className="flex items-center gap-2">
          <span className="text-xs text-cream-500">Sort:</span>
          {SORT_OPTIONS.map((s) => (
            <Link
              key={s.value}
              href={buildHref({ sort: s.value })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                sort === s.value
                  ? "bg-dirt-700 text-cream-100"
                  : "text-cream-500 hover:text-cream-200"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Species Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SPECIES_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={buildHref({ species: f.value })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              species === f.value || (!species && !f.value)
                ? "bg-gradient-to-b from-hay-400 to-hay-500 text-ink shadow-[0_2px_8px_-2px_rgba(224,177,82,0.4)]"
                : "border border-dirt-600 bg-dirt-800/60 text-cream-300 hover:border-cream-400/40 hover:text-cream-100"
            }`}
          >
            <span>{f.emoji}</span>
            {f.label}
          </Link>
        ))}
      </div>

      {/* Filters Panel */}
      <MarketplaceFilters
        gender={gender}
        tier={tier}
        location={location}
        load={load}
        unit={unit}
        minPrice={minPrice}
        maxPrice={maxPrice}
        minHead={minHead}
        maxHead={maxHead}
        locationOptions={locationOptions}
        activeFilterCount={activeFilterCount}
        buildHref={buildHref}
      />

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-cream-400">
          {sorted.length} lot{sorted.length !== 1 ? "s" : ""} found
          {activeFilterCount > 0 && (
            <span className="ml-2 text-cream-500">
              ({activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active)
            </span>
          )}
        </p>
      </div>

      {/* Grid + lot building */}
      <LotBuilder listings={sorted} unit={unit} />
    </div>
  );
}

function StatMini({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className={`font-mono text-xl font-bold ${accent ?? "text-cream-50"}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500">{label}</p>
    </div>
  );
}
