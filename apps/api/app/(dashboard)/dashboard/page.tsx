import Link from "next/link";
import { prisma } from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { getCurrentUser } from "../../../lib/auth";
import { getDemoUserForRole } from "../../../lib/demoAuth";
import { compactMoney } from "../../../lib/format";
import { ListingCard } from "../../../components/ListingCard";
import type { UserRole } from "@livestock/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const current = await getCurrentUser();

  if (!current) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }

  const roles = (current?.roles ?? ["BUYER"]) as UserRole[];
  const multi = roles.length > 1;

  return (
    <div className="space-y-8">
      {multi && (
        <div className="pill border-hay-500/40 bg-hay-500/10 text-hay-200">
          <span className="dot bg-hay-300" />
          Viewing as {roles.join(" + ")}
        </div>
      )}
      {roles.includes("BUYER") && <BuyerHome />}
      {roles.includes("SELLER") && <SellerHome currentUserId={current?.id} />}
      {roles.includes("HAULER") && <HaulerHome currentUserId={current?.id} />}
      {roles.includes("PLATFORM") && <PlatformHome />}
      {roles.includes("ADMIN") && <AdminHome />}
    </div>
  );
}

async function BuyerHome() {
  const listings = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: { seller: { select: { id: true, name: true } } },
  });

  return (
    <section className="space-y-5">
      <div className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-denim-600/20 via-transparent to-pasture-600/15" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="section-label text-denim-300">Buyer viewport</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
              Find your next <span className="text-hay-300">truckload</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cream-300">
              Browse live lots and processed cuts, buy into escrow, and track every load through
              the 24h inspection window.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/marketplace/processor" className="btn-ghost">Processed goods</Link>
            <Link href="/marketplace" className="btn-primary">Browse marketplace →</Link>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-cream-50">Featured lots</h2>
        <Link href="/marketplace" className="text-sm font-medium text-hay-300 hover:text-hay-200">View all →</Link>
      </div>
      {listings.length === 0 ? (
        <div className="card py-12 text-center text-sm text-cream-500">No active listings yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} seller={listing.seller} />
          ))}
        </div>
      )}
    </section>
  );
}


async function SellerHome({ currentUserId }: { currentUserId?: string }) {
  const seller = currentUserId ? { id: currentUserId } : await getDemoUserForRole("SELLER");
  const [listings, escrows] = await Promise.all([
    prisma.listing.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.escrowTransaction.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { buyer: { select: { name: true } } },
    }),
  ]);

  const active = listings.filter((l) => l.status === "ACTIVE").length;
  const sold = listings.filter((l) => l.status === "SOLD").length;
  const revenue = escrows
    .filter((e) => e.status === "RESOLVED_DISBURSED")
    .reduce((sum, e) => sum + e.saleAmountCents, 0);

  return (
    <section className="space-y-5">
      <div className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-pasture-600/20 via-transparent to-hay-600/15" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="section-label text-pasture-300">Seller viewport</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
              Your lots, <span className="text-hay-300">your terms</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cream-300">
              List livestock and processed goods, watch deals move through escrow, and collect
              payouts on the double-entry ledger.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/seller" className="btn-ghost">My listings</Link>
            <Link href="/marketplace/new" className="btn-primary">+ New listing</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Active listings" value={String(active)} accent="text-pasture-300" bar="bg-pasture-400" hint={`${sold} sold`} />
        <StatCard label="Listings" value={String(listings.length)} accent="text-cream-100" bar="bg-denim-400" hint="recent" />
        <StatCard label="Settled revenue" value={compactMoney(revenue)} accent="text-hay-200" bar="bg-hay-400" hint="escrow disbursements" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dirt-700/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-cream-50">Recent listings</h2>
          <Link href="/seller" className="text-sm font-medium text-hay-300 hover:text-hay-200">View all →</Link>
        </div>
        {listings.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-cream-500">No listings yet.</p>
        ) : (
          <ul className="divide-y divide-dirt-700/50">
            {listings.map((l) => (
              <li key={l.id}>
                <Link href={`/marketplace/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-dirt-800/50">
                  <div>
                    <p className="font-medium text-cream-100">{l.breed}</p>
                    <p className="text-xs text-cream-500">{l.headCount} head · {l.location}</p>
                  </div>
                  <span className={`pill ${l.status === "ACTIVE" ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : "border-dirt-600 bg-dirt-800 text-cream-400"}`}>
                    <span className={`dot ${l.status === "ACTIVE" ? "bg-pasture-400" : "bg-cream-500"}`} />
                    {l.status.toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}


async function HaulerHome({ currentUserId }: { currentUserId?: string }) {
  const hauler = currentUserId ? { id: currentUserId } : await getDemoUserForRole("HAULER");
  const [openLoads, completed] = await Promise.all([
    prisma.load.findMany({
      where: { status: "OPEN", escrowId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.load.findMany({ where: { haulerId: hauler.id, status: "COMPLETED" } }),
  ]);

  const miles = completed.reduce((sum, l) => sum + (l.distanceMiles ?? 0), 0);
  const loadsDone = completed.length;
  const dated = completed.filter((l) => l.dueAt !== null);
  const onTimePct = dated.length
    ? Math.round(
        (dated.filter((l) => l.completedAt !== null && (l.completedAt as Date) <= (l.dueAt as Date)).length /
          dated.length) *
          100,
      )
    : 0;

  return (
    <section className="space-y-5">
      <div className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-hay-600/20 via-transparent to-denim-600/15" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="section-label text-hay-300">Hauler viewport</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
              Open loads, <span className="text-hay-300">paid through escrow</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cream-300">
              Accept the transport leg of a funded escrow, move it through pickup and delivery, and
              watch the freight settle into your wallet.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/earnings" className="btn-ghost">Earnings</Link>
            <Link href="/loads" className="btn-primary">Load board →</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Miles hauled" value={new Intl.NumberFormat("en-US").format(miles)} accent="text-pasture-300" bar="bg-pasture-400" hint="lifetime" />
        <StatCard label="Loads completed" value={String(loadsDone)} accent="text-cream-100" bar="bg-denim-400" hint="lifetime" />
        <StatCard label="On-time rate" value={`${onTimePct}%`} accent="text-hay-200" bar="bg-hay-400" hint="completed by due date" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dirt-700/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-cream-50">Open loads</h2>
          <Link href="/loads" className="text-sm font-medium text-hay-300 hover:text-hay-200">View all →</Link>
        </div>
        {openLoads.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-cream-500">No open loads right now.</p>
        ) : (
          <ul className="divide-y divide-dirt-700/50">
            {openLoads.map((l) => (
              <li key={l.id}>
                <Link href="/loads" className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-dirt-800/50">
                  <div>
                    <p className="font-medium text-cream-100">{l.origin} → {l.destination}</p>
                    <p className="text-xs text-cream-500">{l.headCount} head · {new Intl.NumberFormat("en-US").format(l.totalWeightLbs)} lb</p>
                  </div>
                  <span className="font-semibold tabular-nums text-cream-100">{compactMoney(l.freightPayCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

async function PlatformHome() {
  const [activeValue, totalEscrows, openDisputes, ledgerRows, auditBroken] = await Promise.all([
    prisma.escrowTransaction.aggregate({
      where: { status: { in: ["FUNDED", "IN_TRANSIT", "DELIVERED", "INSPECTION_PERIOD", "DISPUTED", "ARBITRATION_PROCESSING"] } },
      _sum: { saleAmountCents: true },
    }),
    prisma.escrowTransaction.count(),
    prisma.automatedDispute.count({ where: { status: { in: ["OPEN", "ARBITRATION_PROCESSING"] } } }),
    prisma.ledgerEntry.count(),
    auditLogger.verifyChain(10_000),
  ]);

  return (
    <section className="space-y-5">
      <div className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-barn-600/20 via-transparent to-plum-600/15" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="section-label text-barn-200">Platform viewport</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
              Operations, <span className="text-hay-300">under control</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cream-300">
              Monitor escrow value, arbitrate disputes, and keep the append-only ledger and audit
              chain intact.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/ledger" className="btn-ghost">Ledger</Link>
            <Link href="/disputes" className="btn-primary">Disputes →</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active escrow value" value={compactMoney(activeValue._sum.saleAmountCents ?? 0)} accent="text-pasture-300" bar="bg-pasture-400" hint={`${totalEscrows} total escrows`} />
        <StatCard label="Open disputes" value={String(openDisputes)} accent="text-barn-200" bar="bg-barn-400" hint="arbitration pipeline" />
        <StatCard label="Ledger rows" value={String(ledgerRows)} accent="text-denim-300" bar="bg-denim-400" hint="double-entry, zero-sum" />
        <StatCard label="Audit chain" value={auditBroken.length === 0 ? "Intact" : "Broken"} accent={auditBroken.length === 0 ? "text-pasture-300" : "text-barn-200"} bar={auditBroken.length === 0 ? "bg-pasture-400" : "bg-barn-400"} hint="append-only, hash-chained" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickCard href="/settings" label="Settings" detail="Fees, tolerance, payout rail" />
        <QuickCard href="/ledger" label="Ledger" detail="Full double-entry journal" />
        <QuickCard href="/disputes" label="Arbitration" detail="Programmatic settlement" />
      </div>
    </section>
  );
}

async function AdminHome() {
  const [totalUsers, activeUsers, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    }),
  ]);

  return (
    <section className="space-y-5">
      <div className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-plum-600/20 via-transparent to-barn-600/15" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="section-label text-plum-300">Admin viewport</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
              Account <span className="text-hay-300">management</span>.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-cream-300">
              Manage user accounts, roles, and platform access.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/users" className="btn-primary">Manage Users →</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total users" value={String(totalUsers)} accent="text-cream-100" bar="bg-denim-400" hint="all accounts" />
        <StatCard label="Active users" value={String(activeUsers)} accent="text-pasture-300" bar="bg-pasture-400" hint="enabled accounts" />
        <StatCard label="Admin accounts" value={String(totalUsers - activeUsers)} accent="text-barn-200" bar="bg-barn-400" hint="disabled accounts" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-dirt-700/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-cream-50">Recent users</h2>
          <Link href="/admin/users" className="text-sm font-medium text-hay-300 hover:text-hay-200">View all →</Link>
        </div>
        <ul className="divide-y divide-dirt-700/50">
          {recentUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="font-medium text-cream-100">{u.name ?? u.email}</p>
                <p className="text-xs text-cream-500">{u.email}</p>
              </div>
              <span className={`pill ${u.isActive ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : "border-barn-500/60 bg-barn-500/15 text-barn-200"}`}>
                <span className={`dot ${u.isActive ? "bg-pasture-400" : "bg-barn-400"}`} />
                {u.role.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function StatCard({ label, value, accent, bar, hint }: { label: string; value: string; accent: string; bar: string; hint: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${bar}`} aria-hidden />
      <p className="section-label">{label}</p>
      <p className={`stat-value ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-cream-500">{hint}</p>
    </div>
  );
}

function QuickCard({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <Link href={href} className="card group p-4 transition-all hover:border-hay-500/50 hover:-translate-y-0.5">
      <p className="font-display font-semibold text-cream-50 group-hover:text-hay-200">{label}</p>
      <p className="mt-1 text-xs text-cream-500">{detail}</p>
    </Link>
  );
}
