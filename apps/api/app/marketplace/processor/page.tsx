import Link from "next/link";
import { prisma, type ProcessorCategory } from "@livestock/db";
import { ListingCard } from "../../../components/ListingCard";
import { listingUnitPriceCents } from "../../../lib/listingPricing";
import { ProcessorFilters } from "./ProcessorFilters";

export const dynamic = "force-dynamic";

const CATEGORY_FILTERS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "", label: "All", emoji: "📦" },
  { value: "BOXED_BEEF", label: "Boxed beef", emoji: "🥩" },
  { value: "CARCASS", label: "Carcass", emoji: "🍖" },
  { value: "GROUND_BEEF", label: "Ground beef", emoji: "🍔" },
  { value: "JERKY", label: "Jerky", emoji: "🥓" },
  { value: "SAUSAGE", label: "Sausage", emoji: "🌭" },
  { value: "DAIRY", label: "Dairy", emoji: "🧀" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "weight", label: "Largest" },
];

function parseMultiParam(val: string | undefined): string[] {
  if (!val) return [];
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function ProcessorMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    sort?: string;
    q?: string;
    unit?: string;
    boneState?: string;
    carcass?: string;
    cut?: string;
    subprimal?: string;
    trim?: string;
    packaging?: string;
    harvest?: string;
    husbandry?: string;
    healthStatus?: string;
    condition?: string;
    frame?: string;
    usdaGrade?: string;
    imps?: string;
  }>;
}) {
  const params = await searchParams;
  const category = (params.category ?? "") as ProcessorCategory | "";
  const sort = params.sort ?? "newest";
  const unit = (params.unit ?? "all") as "all" | "head" | "pound";
  const q = params.q?.trim() ?? "";
  const boneState = parseMultiParam(params.boneState);
  const carcass = parseMultiParam(params.carcass);
  const cut = parseMultiParam(params.cut);
  const subprimal = parseMultiParam(params.subprimal);
  const trim = parseMultiParam(params.trim);
  const packaging = parseMultiParam(params.packaging);
  const harvest = parseMultiParam(params.harvest);
  const husbandry = parseMultiParam(params.husbandry);
  const healthStatus = parseMultiParam(params.healthStatus);
  const condition = parseMultiParam(params.condition);
  const frame = parseMultiParam(params.frame);
  const usdaGrade = parseMultiParam(params.usdaGrade);
  const imps = parseMultiParam(params.imps);

  // Build where clause
  const where: Record<string, unknown> = { marketplace: "PROCESSOR", status: "ACTIVE" };
  const andConditions: Record<string, unknown>[] = [];

  if (category) where.category = category;
  if (q) {
    where.OR = [
      { breed: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  // Multi-select filters
  if (boneState.length > 0) andConditions.push({ condition: { in: boneState } });
  if (carcass.length > 0) andConditions.push({ listingClass: { in: carcass } });
  if (cut.length > 0) andConditions.push({ category: { in: cut } });
  if (subprimal.length > 0) andConditions.push({ subclass: { in: subprimal } });
  if (trim.length > 0) andConditions.push({ condition: { in: trim } });
  if (packaging.length > 0) andConditions.push({ husbandry: { in: packaging } });
  if (harvest.length > 0) andConditions.push({ harvest: { in: harvest } });
  if (husbandry.length > 0) andConditions.push({ husbandry: { in: husbandry } });
  if (healthStatus.length > 0) andConditions.push({ healthStatus: { in: healthStatus } });
  if (condition.length > 0) andConditions.push({ condition: { in: condition } });
  if (frame.length > 0) andConditions.push({ frame: { in: frame } });
  if (usdaGrade.length > 0) andConditions.push({ registryType: { in: usdaGrade } });
  if (imps.length > 0) andConditions.push({ registry: { in: imps } });

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

  const sorted = [...listings];
  if (sort === "price_asc") {
    sorted.sort((a, b) => listingUnitPriceCents(a, unit).cents - listingUnitPriceCents(b, unit).cents);
  } else if (sort === "price_desc") {
    sorted.sort((a, b) => listingUnitPriceCents(b, unit).cents - listingUnitPriceCents(a, unit).cents);
  }

  const stats = await prisma.listing.aggregate({
    where: { marketplace: "PROCESSOR", status: "ACTIVE" },
    _count: { _all: true },
    _sum: { headCount: true },
  });

  const totalActive = stats._count._all;
  const totalUnits = stats._sum.headCount ?? 0;

  // Count active filters
  const activeFilterCount = [
    category,
    boneState.length > 0,
    carcass.length > 0,
    cut.length > 0,
    subprimal.length > 0,
    trim.length > 0,
    packaging.length > 0,
    harvest.length > 0,
    husbandry.length > 0,
    healthStatus.length > 0,
    condition.length > 0,
    frame.length > 0,
    usdaGrade.length > 0,
    imps.length > 0,
    q,
  ].filter(Boolean).length;

  function buildHref(overrides: Record<string, string>): string {
    const sp = new URLSearchParams();
    const base: Record<string, string> = {};
    if (category) base.category = category;
    if (sort !== "newest") base.sort = sort;
    if (unit !== "all") base.unit = unit;
    if (q) base.q = q;
    if (boneState.length > 0) base.boneState = boneState.join(",");
    if (carcass.length > 0) base.carcass = carcass.join(",");
    if (cut.length > 0) base.cut = cut.join(",");
    if (subprimal.length > 0) base.subprimal = subprimal.join(",");
    if (trim.length > 0) base.trim = trim.join(",");
    if (packaging.length > 0) base.packaging = packaging.join(",");
    if (harvest.length > 0) base.harvest = harvest.join(",");
    if (husbandry.length > 0) base.husbandry = husbandry.join(",");
    if (healthStatus.length > 0) base.healthStatus = healthStatus.join(",");
    if (condition.length > 0) base.condition = condition.join(",");
    if (frame.length > 0) base.frame = frame.join(",");
    if (usdaGrade.length > 0) base.usdaGrade = usdaGrade.join(",");
    if (imps.length > 0) base.imps = imps.join(",");
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/marketplace/processor${qs ? "?" + qs : ""}`;
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1.5">
        <Link href="/marketplace" className="rounded-lg border border-dirt-600 bg-dirt-800/60 px-3 py-1.5 text-sm font-medium text-cream-300 hover:text-cream-100">
          🐄 Live animals
        </Link>
        <Link href="/marketplace/processor" className="rounded-lg bg-gradient-to-b from-hay-400 to-hay-500 px-3 py-1.5 text-sm font-bold text-ink shadow-[0_2px_8px_-2px_rgba(224,177,82,0.4)]">
          🥩 Processed goods
        </Link>
      </div>

      {/* Hero */}
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-barn-600/15 via-transparent to-hay-500/15" aria-hidden />
        <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-barn-400/8 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="section-label text-barn-300">Processor Marketplace</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
            Boxed, cut &amp; <span className="text-hay-300">ready to ship</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-300">
            Verified processors listing boxed primals, ground product and value-added cuts.
            Same escrow protection — your funds release only after inspection clears.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <StatMini label="Active products" value={String(totalActive)} />
            <StatMini label="Units available" value={new Intl.NumberFormat("en-US").format(totalUnits)} />
            <StatMini label="Escrow-backed" value="100%" accent="text-pasture-300" />
          </div>
        </div>
      </section>

      {/* Search + Sort + Category Pills + Price Display */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={buildHref({ category: f.value })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                category === f.value || (!category && !f.value)
                  ? "bg-gradient-to-b from-hay-400 to-hay-500 text-ink shadow-[0_2px_8px_-2px_rgba(224,177,82,0.4)]"
                  : "border border-dirt-600 bg-dirt-800/60 text-cream-300 hover:border-cream-400/40 hover:text-cream-100"
              }`}
            >
              <span>{f.emoji}</span>
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <form action="/marketplace/processor" method="get" className="flex items-center gap-2">
            <input type="hidden" name="status" value="ACTIVE" />
            {category && <input type="hidden" name="category" value={category} />}
            <input type="search" name="q" defaultValue={q} placeholder="Search product or location…" className="input !w-64" />
            <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">Search</button>
          </form>
          <div className="flex items-center gap-2">
            <span className="text-xs text-cream-500">Sort:</span>
            {SORT_OPTIONS.map((s) => (
              <Link
                key={s.value}
                href={buildHref({ sort: s.value })}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  sort === s.value ? "bg-dirt-700 text-cream-100" : "text-cream-500 hover:text-cream-200"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar + Listings layout */}
      <div className="flex gap-6 items-start">
        {/* Filter sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 sticky top-24">
          <ProcessorFilters
            boneState={boneState}
            carcass={carcass}
            cut={cut}
            subprimal={subprimal}
            trim={trim}
            packaging={packaging}
            harvest={harvest}
            husbandry={husbandry}
            healthStatus={healthStatus}
            condition={condition}
            frame={frame}
            usdaGrade={usdaGrade}
            imps={imps}
            activeFilterCount={activeFilterCount}
          />
        </aside>

        {/* Listings column */}
        <div className="flex-1 min-w-0">
          {/* Mobile filter toggle */}
          <div className="lg:hidden mb-4">
            <ProcessorFilters
              boneState={boneState}
              carcass={carcass}
              cut={cut}
              subprimal={subprimal}
              trim={trim}
              packaging={packaging}
              harvest={harvest}
              husbandry={husbandry}
              healthStatus={healthStatus}
              condition={condition}
              frame={frame}
              usdaGrade={usdaGrade}
              imps={imps}
              activeFilterCount={activeFilterCount}
            />
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-cream-400">
              {sorted.length} product{sorted.length !== 1 ? "s" : ""} found
              {activeFilterCount > 0 && (
                <span className="ml-2 text-cream-500">
                  ({activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active)
                </span>
              )}
            </p>
          </div>

          {/* Grid */}
          {sorted.length === 0 ? (
            <div className="card py-20 text-center">
              <span className="text-5xl opacity-30">🥩</span>
              <p className="mt-4 text-sm text-cream-400">No products found for this filter.</p>
              <Link href="/marketplace/processor" className="mt-3 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">
                Clear filters →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((listing) => (
                <ListingCard key={listing.id} listing={listing} seller={listing.seller} />
              ))}
            </div>
          )}
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
