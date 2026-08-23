import Link from "next/link";
import { prisma, type Species } from "@livestock/db";
import { listingUnitPriceCents, type ListingUnit } from "../../lib/listingPricing";
import { LotBuilder } from "../../components/LotBuilder";

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

const LOAD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All loads" },
  { value: "FULL_LOAD", label: "Full load" },
  { value: "LTL", label: "LTL" },
];

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ species?: string; sort?: string; status?: string; unit?: string; load?: string; q?: string }>;
}) {
  const params = await searchParams;
  const species = (params.species ?? "") as Species | "";
  const sort = params.sort ?? "newest";
  const status = params.status ?? "ACTIVE";
  const unit = (params.unit ?? "all") as ListingUnit;
  const load = params.load ?? "";
  const q = params.q?.trim() ?? "";

  const where: Record<string, unknown> = { marketplace: "LIVE" };
  if (species) where.species = species;
  if (status) where.status = status;
  if (load) where.loadType = load;
  if (q) {
    where.OR = [
      { breed: { contains: q, mode: "insensitive" } },
      { location: { contains: q, mode: "insensitive" } },
    ];
  }

  const baseOrderBy: Record<string, string> =
    sort === "weight" ? { avgWeightLbs: "desc" } : { createdAt: "desc" };

  const listings = await prisma.listing.findMany({
    where,
    orderBy: baseOrderBy,
    include: { seller: { select: { id: true, name: true } } },
  });

  // Price sorts compare the effective unit price for the selected unit view.
  const sorted = [...listings];
  if (sort === "price_asc") {
    sorted.sort((a, b) => listingUnitPriceCents(a, unit).cents - listingUnitPriceCents(b, unit).cents);
  } else if (sort === "price_desc") {
    sorted.sort((a, b) => listingUnitPriceCents(b, unit).cents - listingUnitPriceCents(a, unit).cents);
  }

  const stats = await prisma.listing.groupBy({
    by: ["species"],
    where: { marketplace: "LIVE", status: "ACTIVE" },
    _count: { _all: true },
    _sum: { headCount: true },
  });

  const totalActive = stats.reduce((n, s) => n + s._count._all, 0);
  const totalHead = stats.reduce((n, s) => n + (s._sum.headCount ?? 0), 0);

  function buildHref(overrides: Record<string, string>): string {
    const sp = new URLSearchParams();
    const base: Record<string, string> = { status: "ACTIVE" };
    if (species) base.species = species;
    if (sort !== "newest") base.sort = sort;
    if (unit !== "all") base.unit = unit;
    if (load) base.load = load;
    if (q) base.q = q;
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    return `/marketplace?${sp.toString()}`;
  }

  return (
    <div className="space-y-8">
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

      {/* Filters */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <form action="/marketplace" method="get" className="flex items-center gap-2">
            <input type="hidden" name="status" value="ACTIVE" />
            <input type="search" name="q" defaultValue={q} placeholder="Search breed or location…" className="input !w-64" />
            <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">Search</button>
          </form>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-cream-500">Sort:</span>
            {[
              { value: "newest", label: "Newest" },
              { value: "price_asc", label: "Price ↑" },
              { value: "price_desc", label: "Price ↓" },
              { value: "weight", label: "Heaviest" },
            ].map((s) => (
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

        {/* Unit + load type toggles */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-dirt-700/50 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Price</span>
            <div className="flex items-center gap-1 rounded-lg border border-dirt-600 bg-dirt-800/60 p-0.5">
              {UNIT_OPTIONS.map((u) => (
                <Link
                  key={u.value}
                  href={buildHref({ unit: u.value })}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    unit === u.value
                      ? "bg-gradient-to-b from-hay-400 to-hay-500 text-ink"
                      : "text-cream-400 hover:text-cream-100"
                  }`}
                >
                  {u.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Load</span>
            <div className="flex items-center gap-1">
              {LOAD_OPTIONS.map((l) => (
                <Link
                  key={l.value}
                  href={buildHref({ load: l.value })}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    load === l.value
                      ? "bg-dirt-700 text-cream-100"
                      : "text-cream-500 hover:text-cream-200"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

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
