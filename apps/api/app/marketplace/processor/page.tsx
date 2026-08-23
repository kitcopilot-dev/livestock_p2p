import Link from "next/link";
import { prisma, type ProcessorCategory } from "@livestock/db";
import { ListingCard } from "../../../components/ListingCard";
import { listingUnitPriceCents } from "../../../lib/listingPricing";

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

export default async function ProcessorMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; q?: string }>;
}) {
  const params = await searchParams;
  const category = (params.category ?? "") as ProcessorCategory | "";
  const sort = params.sort ?? "newest";
  const q = params.q?.trim() ?? "";

  const where: Record<string, unknown> = { marketplace: "PROCESSOR", status: "ACTIVE" };
  if (category) where.category = category;
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

  const sorted = [...listings];
  if (sort === "price_asc") {
    sorted.sort((a, b) => listingUnitPriceCents(a, "all").cents - listingUnitPriceCents(b, "all").cents);
  } else if (sort === "price_desc") {
    sorted.sort((a, b) => listingUnitPriceCents(b, "all").cents - listingUnitPriceCents(a, "all").cents);
  }

  const stats = await prisma.listing.aggregate({
    where: { marketplace: "PROCESSOR", status: "ACTIVE" },
    _count: { _all: true },
    _sum: { headCount: true },
  });

  const totalActive = stats._count._all;
  const totalUnits = stats._sum.headCount ?? 0;

  function buildHref(overrides: Record<string, string>): string {
    const sp = new URLSearchParams();
    const base: Record<string, string> = {};
    if (category) base.category = category;
    if (sort !== "newest") base.sort = sort;
    if (q) base.q = q;
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/marketplace/processor${qs ? "?" + qs : ""}`;
  }

  return (
    <div className="space-y-8">
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

      {/* Filters */}
      <section className="space-y-3">
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
          <form action="/marketplace/processor" method="get" className="flex items-center gap-2">
            <input type="search" name="q" defaultValue={q} placeholder="Search product or location…" className="input !w-64" />
            <button type="submit" className="btn-ghost px-3 py-1.5 text-sm">Search</button>
          </form>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-cream-500">Sort:</span>
          {[
            { value: "newest", label: "Newest" },
            { value: "price_asc", label: "Price ↑" },
            { value: "price_desc", label: "Price ↓" },
            { value: "weight", label: "Largest" },
          ].map((s) => (
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
      </section>

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
