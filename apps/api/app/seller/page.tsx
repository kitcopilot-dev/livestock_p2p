import Link from "next/link";
import { prisma } from "@livestock/db";
import { compactMoney, formatDate } from "../../lib/format";
import { listingUnitPriceCents } from "../../lib/listingPricing";
import { getDemoUser } from "../../lib/demoAuth";

export const dynamic = "force-dynamic";

export default async function SellerDashboardPage() {
  const user = await getDemoUser();

  const [listings, stats, escrows] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.aggregate({
      where: { sellerId: user.id },
      _sum: { headCount: true, pricePerLbCents: true, avgWeightLbs: true },
      _count: { _all: true },
    }),
    prisma.escrowTransaction.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { buyer: { select: { name: true } } },
    }),
  ]);

  const activeListings = listings.filter((l) => l.status === "ACTIVE").length;
  const soldListings = listings.filter((l) => l.status === "SOLD").length;
  const totalHead = stats._sum.headCount ?? 0;
  const avgPrice = stats._sum.pricePerLbCents ? stats._sum.pricePerLbCents / stats._count._all / 100 : 0;
  const totalRevenue = escrows
    .filter((e) => e.status === "RESOLVED_DISBURSED")
    .reduce((sum, e) => sum + e.saleAmountCents, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-label text-pasture-300">Seller dashboard</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
            My listings
          </h1>
          <p className="mt-1 text-sm text-cream-400">
            Manage your lots and track transactions as {user.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/marketplace" className="btn-ghost">Marketplace</Link>
          <Link href="/marketplace/new" className="btn-primary">+ New listing</Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total listings" value={String(stats._count._all)} bar="bg-denim-400" accent="text-cream-100" hint={`${activeListings} active, ${soldListings} sold`} />
        <StatCard label="Head listed" value={new Intl.NumberFormat("en-US").format(totalHead)} bar="bg-pasture-400" accent="text-pasture-300" hint="total across all lots" />
        <StatCard label="Avg price/lb" value={"$" + avgPrice.toFixed(2)} bar="bg-hay-400" accent="text-hay-200" hint="across all listings" />
        <StatCard label="Escrow revenue" value={compactMoney(totalRevenue)} bar="bg-barn-400" accent="text-barn-200" hint={`${escrows.length} total transactions`} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dirt-700/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-cream-50">My listings</h2>
          <Link href="/marketplace/new" className="text-sm font-medium text-hay-300 hover:text-hay-200">+ New listing</Link>
        </div>
        {listings.length === 0 ? (
          <div className="py-16 text-center">
            <span className="text-5xl opacity-30">🌾</span>
            <p className="mt-4 text-sm text-cream-400">No listings yet.</p>
            <Link href="/marketplace/new" className="mt-3 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">Create your first listing →</Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Breed</th>
                <th className="px-5 py-3.5 font-semibold">Species</th>
                <th className="px-5 py-3.5 font-semibold">Head</th>
                <th className="px-5 py-3.5 font-semibold">Weight</th>
                <th className="px-5 py-3.5 font-semibold">Price</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {listings.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="px-5 py-3.5">
                    <Link href={`/marketplace/${l.id}`} className="font-medium text-hay-300 hover:text-hay-200">{l.breed}</Link>
                  </td>
                  <td className="px-5 py-3.5 text-cream-300">{l.species.charAt(0) + l.species.slice(1).toLowerCase()}</td>
                  <td className="px-5 py-3.5 tabular-nums text-cream-200">{l.headCount}</td>
                  <td className="px-5 py-3.5 tabular-nums text-cream-200">{new Intl.NumberFormat("en-US").format(l.avgWeightLbs)} lb</td>
                  <td className="px-5 py-3.5 font-semibold tabular-nums text-cream-100">${(listingUnitPriceCents(l, "all").cents / 100).toFixed(2)}<span className="ml-0.5 text-[10px] font-normal text-cream-500">/${listingUnitPriceCents(l, "all").label}</span></td>
                  <td className="px-5 py-3.5">
                    <span className={"pill " + (l.status === "ACTIVE" ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : l.status === "SOLD" ? "border-denim-500/60 bg-denim-500/15 text-denim-200" : "border-dirt-600 bg-dirt-800 text-cream-400")}>
                      <span className={"dot " + (l.status === "ACTIVE" ? "bg-pasture-400" : l.status === "SOLD" ? "bg-denim-400" : "bg-cream-500")} />
                      {l.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-cream-500">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {escrows.length > 0 && (
        <section className="card overflow-hidden">
          <div className="border-b border-dirt-700/70 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-cream-50">Recent transactions</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Reference</th>
                <th className="px-5 py-3.5 font-semibold">Buyer</th>
                <th className="px-5 py-3.5 font-semibold">Amount</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {escrows.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="px-5 py-3.5">
                    <Link href={`/escrows/${e.id}`} className="font-mono font-medium text-hay-300 hover:text-hay-200">{e.reference}</Link>
                  </td>
                  <td className="px-5 py-3.5 text-cream-300">{e.buyer.name}</td>
                  <td className="px-5 py-3.5 font-semibold tabular-nums text-cream-100">{compactMoney(e.saleAmountCents)}</td>
                  <td className="px-5 py-3.5">
                    <span className={"pill " + (e.status === "RESOLVED_DISBURSED" ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : "border-hay-500/60 bg-hay-500/15 text-hay-200")}>
                      <span className={"dot " + (e.status === "RESOLVED_DISBURSED" ? "bg-pasture-400" : "bg-hay-300")} />
                      {e.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-cream-500">{formatDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, bar, hint }: { label: string; value: string; accent: string; bar: string; hint: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={"absolute inset-x-0 top-0 h-0.5 " + bar} aria-hidden />
      <p className="section-label">{label}</p>
      <p className={"stat-value " + accent}>{value}</p>
      <p className="mt-1 text-[11px] text-cream-500">{hint}</p>
    </div>
  );
}
