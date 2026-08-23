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

function parseMultiParam(val: string | undefined): string[] {
  if (!val) return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
    ageRange?: string;
    frame?: string;
    harvest?: string;
    husbandry?: string;
    healthStatus?: string;
    fertility?: string;
    condition?: string;
  }>;
}) {
  const params = await searchParams;
  const species = (params.species ?? "") as Species | "";
  const sort = params.sort ?? "newest";
  const status = params.status ?? "ACTIVE";
  const unit = (params.unit ?? "all") as ListingUnit;
  const load = parseMultiParam(params.load);
  const q = params.q?.trim() ?? "";
  const gender = parseMultiParam(params.gender);
  const tier = parseMultiParam(params.tier);
  const location = params.location?.trim() ?? "";
  const minPrice = params.minPrice ? parseInt(params.minPrice) : null;
  const maxPrice = params.maxPrice ? parseInt(params.maxPrice) : null;
  const minHead = params.minHead ? parseInt(params.minHead) : null;
  const maxHead = params.maxHead ? parseInt(params.maxHead) : null;
  const ageRange = parseMultiParam(params.ageRange);
  const frame = parseMultiParam(params.frame);
  const harvest = parseMultiParam(params.harvest);
  const husbandry = parseMultiParam(params.husbandry);
  const healthStatus = parseMultiParam(params.healthStatus);
  const fertility = parseMultiParam(params.fertility);
  const condition = parseMultiParam(params.condition);

  // Build where clause
  const where: Record<string, unknown> = { marketplace: "LIVE" };
  const andConditions: Record<string, unknown>[] = [];

  if (species) where.species = species;
  if (status) where.status = status;
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

  // Multi-select filters (comma-separated → OR within group, AND across groups)
  if (gender.length > 0) andConditions.push({ gender: { in: gender } });
  if (tier.length > 0) andConditions.push({ tier: { in: tier } });
  if (load.length > 0) andConditions.push({ loadType: { in: load } });
  if (ageRange.length > 0) andConditions.push({ ageRange: { in: ageRange } });
  if (frame.length > 0) andConditions.push({ frame: { in: frame } });
  if (harvest.length > 0) andConditions.push({ harvest: { in: harvest } });
  if (husbandry.length > 0) andConditions.push({ husbandry: { in: husbandry } });
  if (healthStatus.length > 0) andConditions.push({ healthStatus: { in: healthStatus } });
  if (fertility.length > 0) andConditions.push({ fertility: { in: fertility } });
  if (condition.length > 0) andConditions.push({ condition: { in: condition } });

  // Price range filter
  if (minPrice !== null || maxPrice !== null) {
    if (minPrice !== null) andConditions.push({ pricePerLbCents: { gte: minPrice } });
    if (maxPrice !== null) andConditions.push({ pricePerLbCents: { lte: maxPrice } });
  }

  // Head count range filter
  if (minHead !== null || maxHead !== null) {
    if (minHead !== null) andConditions.push({ headCount: { gte: minHead } });
    if (maxHead !== null) andConditions.push({ headCount: { lte: maxHead } });
  }

  // Merge AND conditions
  if (andConditions.length === 1) {
    Object.assign(where, andConditions[0]);
  } else if (andConditions.length > 1) {
    where.AND = andConditions;
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
    if (load.length > 0) base.load = load.join(",");
    if (q) base.q = q;
    if (gender.length > 0) base.gender = gender.join(",");
    if (tier.length > 0) base.tier = tier.join(",");
    if (location) base.location = location;
    if (minPrice !== null) base.minPrice = String(minPrice);
    if (maxPrice !== null) base.maxPrice = String(maxPrice);
    if (minHead !== null) base.minHead = String(minHead);
    if (maxHead !== null) base.maxHead = String(maxHead);
    if (ageRange.length > 0) base.ageRange = ageRange.join(",");
    if (frame.length > 0) base.frame = frame.join(",");
    if (harvest.length > 0) base.harvest = harvest.join(",");
    if (husbandry.length > 0) base.husbandry = husbandry.join(",");
    if (healthStatus.length > 0) base.healthStatus = healthStatus.join(",");
    if (fertility.length > 0) base.fertility = fertility.join(",");
    if (condition.length > 0) base.condition = condition.join(",");
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    return `/marketplace?${sp.toString()}`;
  }

  // Count active filters
  const activeFilterCount = [
    species,
    gender.length > 0,
    tier.length > 0,
    location,
    minPrice !== null,
    maxPrice !== null,
    minHead !== null,
    maxHead !== null,
    ageRange.length > 0,
    frame.length > 0,
    harvest.length > 0,
    husbandry.length > 0,
    healthStatus.length > 0,
    fertility.length > 0,
    condition.length > 0,
    load.length > 0,
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
          {gender.length > 0 && <input type="hidden" name="gender" value={gender.join(",")} />}
          {tier.length > 0 && <input type="hidden" name="tier" value={tier.join(",")} />}
          {load.length > 0 && <input type="hidden" name="load" value={load.join(",")} />}
          {location && <input type="hidden" name="location" value={location} />}
          {ageRange.length > 0 && <input type="hidden" name="ageRange" value={ageRange.join(",")} />}
          {frame.length > 0 && <input type="hidden" name="frame" value={frame.join(",")} />}
          {harvest.length > 0 && <input type="hidden" name="harvest" value={harvest.join(",")} />}
          {husbandry.length > 0 && <input type="hidden" name="husbandry" value={husbandry.join(",")} />}
          {healthStatus.length > 0 && <input type="hidden" name="healthStatus" value={healthStatus.join(",")} />}
          {fertility.length > 0 && <input type="hidden" name="fertility" value={fertility.join(",")} />}
          {condition.length > 0 && <input type="hidden" name="condition" value={condition.join(",")} />}
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

      {/* Sidebar + Listings layout */}
      <div className="flex gap-6 items-start">
        {/* Filter sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 sticky top-24">
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
            ageRange={ageRange}
            frame={frame}
            harvest={harvest}
            husbandry={husbandry}
            healthStatus={healthStatus}
            fertility={fertility}
            condition={condition}
          />
        </aside>

        {/* Listings column */}
        <div className="flex-1 min-w-0">
          {/* Mobile filter toggle */}
          <div className="lg:hidden mb-4">
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
              ageRange={ageRange}
              frame={frame}
              harvest={harvest}
              husbandry={husbandry}
              healthStatus={healthStatus}
              fertility={fertility}
              condition={condition}
            />
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-4">
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
      </div>
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
