import Link from "next/link";
import { prisma, type LoadStatus } from "@livestock/db";
import { acceptLoadAction, demoFundEscrowAction, updateLoadStatusAction } from "../actions/listings";
import { getDemoUser, getDemoRole } from "../../lib/demoAuth";
import { compactMoney, formatDate } from "../../lib/format";

export const dynamic = "force-dynamic";

const STANDALONE_FREIGHT = process.env.FEATURE_STANDALONE_FREIGHT === "true";

const SPECIES_EMOJI: Record<string, string> = {
  CATTLE: "🐄", HOG: "🐷", SHEEP: "🐑", GOAT: "🐐",
  PROCESSOR: "📦",
};

const STATUS_STYLES: Record<LoadStatus, string> = {
  OPEN: "border-hay-500/60 bg-hay-500/15 text-hay-200",
  ASSIGNED: "border-denim-500/60 bg-denim-500/15 text-denim-200",
  IN_TRANSIT: "border-barn-500/60 bg-barn-500/15 text-barn-200",
  COMPLETED: "border-pasture-500/60 bg-pasture-500/15 text-pasture-200",
  CANCELLED: "border-dirt-600 bg-dirt-800 text-cream-400",
};

const STATUS_DOT: Record<LoadStatus, string> = {
  OPEN: "bg-hay-300",
  ASSIGNED: "bg-denim-400",
  IN_TRANSIT: "bg-barn-400",
  COMPLETED: "bg-pasture-400",
  CANCELLED: "bg-cream-500",
};

export default async function LoadsPage() {
  const [user, role] = await Promise.all([getDemoUser(), getDemoRole()]);

  const openWhere: Record<string, unknown> = STANDALONE_FREIGHT
    ? { status: "OPEN" }
    : { status: "OPEN", escrowId: { not: null } };

  const [openLoads, myLoads, postedLoads, stats, completedTrips] = await Promise.all([
    prisma.load.findMany({
      where: openWhere,
      orderBy: { createdAt: "asc" },
      include: { escrow: { select: { reference: true, status: true } }, poster: { select: { name: true } } },
    }),
    prisma.load.findMany({
      where: { haulerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { escrow: { select: { reference: true, status: true, settlementAt: true } }, poster: { select: { name: true } } },
      take: 8,
    }),
    STANDALONE_FREIGHT
      ? prisma.load.findMany({
          where: { posterId: user.id },
          orderBy: { createdAt: "desc" },
          include: {
            escrow: { select: { reference: true, status: true } },
            hauler: { select: { name: true } },
          },
          take: 8,
        })
      : Promise.resolve([]),
    prisma.load.aggregate({
      where: STANDALONE_FREIGHT ? { status: "OPEN" } : { status: "OPEN", escrowId: { not: null } },
      _count: { _all: true },
      _sum: { freightPayCents: true, totalWeightLbs: true },
    }),
    role === "HAULER"
      ? prisma.load.findMany({
          where: { haulerId: user.id, status: "COMPLETED" },
          select: { distanceMiles: true, completedAt: true, dueAt: true },
        })
      : Promise.resolve([]),
  ]);

  const openCount = stats._count._all;
  const freightPool = stats._sum.freightPayCents ?? 0;
  const openWeight = stats._sum.totalWeightLbs ?? 0;
  const isHauler = role === "HAULER";

  // Trip history for the hauler hero: miles hauled, loads completed, and the
  // share of completed trips that arrived by their promised due date.
  const completedLoads = completedTrips as Array<{ distanceMiles: number | null; completedAt: Date | null; dueAt: Date | null }>;
  const milesHauled = completedLoads.reduce((acc, l) => acc + (l.distanceMiles ?? 0), 0);
  const loadsCompleted = completedLoads.length;
  const dated = completedLoads.filter((l) => l.completedAt && l.dueAt);
  const onTime = dated.filter((l) => l.completedAt! <= l.dueAt!).length;
  const onTimeRate = dated.length > 0 ? Math.round((onTime / dated.length) * 100) : null;
  const verified = user.kycStatus === "APPROVED";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-denim-600/20 via-transparent to-hay-500/15" aria-hidden />
        <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-hay-400/8 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="section-label text-denim-300">Transport load board</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
            Haul freight, <span className="text-hay-300">paid through escrow</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-300">
            Every open load is the transport leg of a funded escrow — accept and the freight payout
            settles to you when the deal completes. No chasing invoices.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <StatMini label="Open loads" value={String(openCount)} />
            <StatMini label="Freight pool" value={compactMoney(freightPool)} />
            <StatMini label="Open weight" value={new Intl.NumberFormat("en-US").format(openWeight) + " lb"} />
          </div>
          {isHauler ? (
            <div className={`mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${verified ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : "border-barn-500/60 bg-barn-500/15 text-barn-200"}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${verified ? "bg-pasture-400" : "bg-barn-400"}`} />
              Your KYC: {verified ? "Approved — verified to haul" : user.kycStatus.toLowerCase() + " — verification pending"}
            </div>
          ) : (
            <p className="mt-5 inline-block rounded-full border border-dirt-600 bg-dirt-800/70 px-3 py-1.5 text-xs text-cream-400">
              Viewing as {user.name} — switch to the Hauler role to accept loads.
            </p>
          )}
          {isHauler && (
            <div className="mt-6 flex flex-wrap items-center gap-6 border-t border-dirt-700/50 pt-5">
              <StatMini label="Miles hauled" value={new Intl.NumberFormat("en-US").format(milesHauled) + " mi"} />
              <StatMini label="Loads completed" value={String(loadsCompleted)} />
              <StatMini label="On-time rate" value={onTimeRate === null ? "—" : onTimeRate + "%"} />
            </div>
          )}
        </div>
      </section>

      {/* Post a load (standalone freight) */}
      {STANDALONE_FREIGHT && (
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/loads/new" className="btn-primary px-5 py-2.5 text-sm">+ Post a load</Link>
          <span className="text-xs text-cream-500">Sellers post freight-only jobs; haulers accept them.</span>
        </div>
      )}

      {/* Open loads */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-cream-50">Open loads</h2>
            <p className="mt-1 text-sm text-cream-500">Freight ready to be claimed</p>
          </div>
          <span className="rounded-full border border-hay-500/50 bg-hay-500/10 px-3 py-1 text-xs font-semibold text-hay-200">
            {openCount} available
          </span>
        </div>

        {openLoads.length === 0 ? (
          <div className="card py-16 text-center">
            <span className="text-5xl opacity-30">🚚</span>
            <p className="mt-4 text-sm text-cream-400">No open loads right now. Check back after the next sale funds.</p>
            <Link href="/marketplace" className="mt-3 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">Browse the marketplace →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {openLoads.map((load) => (
              <LoadCard key={load.id} load={load} emoji={SPECIES_EMOJI[load.marketplace === "PROCESSOR" ? "PROCESSOR" : load.species] ?? "🚚"} canAccept={isHauler} />
            ))}
          </div>
        )}
      </section>

      {/* My loads */}
      {myLoads.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-cream-50">My loads</h2>
            <p className="mt-1 text-sm text-cream-500">Loads you have accepted</p>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Route</th>
                  <th className="px-5 py-3.5 font-semibold">Cargo</th>
                  <th className="px-5 py-3.5 font-semibold">Freight pay</th>
                  <th className="px-5 py-3.5 font-semibold">Escrow</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Accepted</th>
                  <th className="px-5 py-3.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dirt-700/50">
                {myLoads.map((load) => (
                  <tr key={load.id} className="transition-colors hover:bg-dirt-800/40">
                    <td className="px-5 py-3.5 font-medium text-cream-100">{load.origin} → {load.destination}</td>
                    <td className="px-5 py-3.5 text-cream-300">{load.headCount} {load.marketplace === "PROCESSOR" ? "units" : "head"} · {new Intl.NumberFormat("en-US").format(load.totalWeightLbs)} lb</td>
                    <td className="px-5 py-3.5 font-semibold tabular-nums text-hay-200">{compactMoney(load.freightPayCents)}</td>
                    <td className="px-5 py-3.5">
                      {load.escrow ? (
                        <div className="flex flex-col items-start gap-1">
                          <Link href={`/escrows/${load.escrowId}`} className="font-mono font-medium text-denim-300 hover:text-denim-200">{load.escrow.reference}</Link>
                          {load.escrow.status === "DRAFT" && (
                            <form action={async () => { "use server"; await demoFundEscrowAction(load.id); }}>
                              <button type="submit" className="rounded-md border border-hay-500/50 bg-hay-500/15 px-2 py-0.5 text-[10px] font-semibold text-hay-200 transition-colors hover:bg-hay-500/25">
                                Fund escrow (demo)
                              </button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-cream-500">Standalone freight</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={"pill " + STATUS_STYLES[load.status]}>
                        <span className={"dot " + STATUS_DOT[load.status]} />
                        {load.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-cream-500">{load.acceptedAt ? formatDate(load.acceptedAt) : "—"}</td>
                    <td className="px-5 py-3.5">
                      {load.status === "ASSIGNED" && (
                        <form action={async () => { "use server"; await updateLoadStatusAction(load.id, "IN_TRANSIT"); }}>
                          <button type="submit" className="rounded-lg border border-hay-500/50 bg-hay-500/15 px-2.5 py-1 text-xs font-semibold text-hay-200 transition-colors hover:bg-hay-500/25">
                            Mark picked up
                          </button>
                        </form>
                      )}
                      {load.status === "IN_TRANSIT" && (
                        <form action={async () => { "use server"; await updateLoadStatusAction(load.id, "COMPLETED"); }}>
                          <button type="submit" className="rounded-lg border border-pasture-500/60 bg-pasture-500/15 px-2.5 py-1 text-xs font-semibold text-pasture-200 transition-colors hover:bg-pasture-500/25">
                            Mark delivered
                          </button>
                        </form>
                      )}
                      {load.status === "COMPLETED" && (
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-pasture-300">
                            <span className="text-pasture-400">&#10003;</span>
                            {load.completedAt ? "Delivered " + formatDate(load.completedAt) : "Delivered"}
                          </span>
                          {load.paidAt ? (
                            <span className="text-[10px] font-semibold text-pasture-200">
                              Paid {compactMoney(load.freightPayCents)} · {formatDate(load.paidAt)}
                            </span>
                          ) : load.escrow ? (
                            load.escrow.status === "RESOLVED_DISBURSED" ? (
                              <span className="text-[10px] font-semibold text-pasture-200">
                                Paid {compactMoney(load.freightPayCents)}{load.escrow.settlementAt ? " · " + formatDate(load.escrow.settlementAt) : ""}
                              </span>
                            ) : (
                              <span className="text-[10px] text-cream-500">Payout pending escrow settlement</span>
                            )
                          ) : (
                            <span className="text-[10px] font-semibold text-pasture-200">Paid {compactMoney(load.freightPayCents)} on completion</span>
                          )}
                        </div>
                      )}
                      {load.status === "CANCELLED" && <span className="text-xs text-cream-500">Cancelled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* My postings (standalone freight) */}
      {STANDALONE_FREIGHT && role === "SELLER" && postedLoads.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-cream-50">My postings</h2>
            <p className="mt-1 text-sm text-cream-500">Freight jobs you have posted</p>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Route</th>
                  <th className="px-5 py-3.5 font-semibold">Cargo</th>
                  <th className="px-5 py-3.5 font-semibold">Freight pay</th>
                  <th className="px-5 py-3.5 font-semibold">Hauler</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dirt-700/50">
                {postedLoads.map((load) => (
                  <tr key={load.id} className="transition-colors hover:bg-dirt-800/40">
                    <td className="px-5 py-3.5 font-medium text-cream-100">{load.origin} → {load.destination}</td>
                    <td className="px-5 py-3.5 text-cream-300">{load.headCount} head · {new Intl.NumberFormat("en-US").format(load.totalWeightLbs)} lb</td>
                    <td className="px-5 py-3.5 font-semibold tabular-nums text-hay-200">{compactMoney(load.freightPayCents)}</td>
                    <td className="px-5 py-3.5 text-cream-300">{load.hauler?.name ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={"pill " + STATUS_STYLES[load.status]}>
                        <span className={"dot " + STATUS_DOT[load.status]} />
                        {load.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-cream-500">{formatDate(load.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
}

function LoadCard({ load, emoji, canAccept }: { load: { id: string; escrowId: string | null; origin: string; destination: string; loadType: string; marketplace: string; headCount: number; totalWeightLbs: number; freightPayCents: number; distanceMiles: number | null; createdAt: Date; escrow: { reference: string } | null; poster: { name: string | null } | null }; emoji: string; canAccept: boolean }) {
  return (
    <div className="card relative overflow-hidden p-5 transition-all hover:border-hay-500/40">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-denim-400 to-hay-400" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-denim-500/30 bg-denim-500/15 text-xl">
            {emoji}
          </span>
          <div>
            <p className="text-sm font-semibold text-cream-50">{load.origin} → {load.destination}</p>
            <p className="mt-0.5 text-xs text-cream-500">{load.headCount} {load.marketplace === "PROCESSOR" ? "units" : "head"} · {new Intl.NumberFormat("en-US").format(load.totalWeightLbs)} lb{load.distanceMiles ? " · " + load.distanceMiles + " mi" : ""} · posted {formatDate(load.createdAt)}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${load.loadType === "FULL_LOAD" ? "border border-denim-400/50 bg-denim-950/85 text-denim-200" : "border border-hay-500/50 bg-dirt-950/85 text-hay-200"}`}>
          {load.loadType === "FULL_LOAD" ? "⛟ FULL LOAD" : "🚚 LTL"}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-dirt-700/50 pt-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500">Freight pay</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-hay-200">{compactMoney(load.freightPayCents)}</p>
          <p className="mt-0.5 text-[10px] text-cream-600">{load.escrow ? "settles from escrow on delivery" : "agreed rate paid on completion"}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {canAccept ? (
            <form action={async () => { "use server"; await acceptLoadAction(load.id); }}>
              <button type="submit" className="btn-primary px-4 py-2 text-sm">Accept load</button>
            </form>
          ) : (
            <span className="rounded-lg border border-dirt-600 bg-dirt-800/60 px-3 py-1.5 text-xs text-cream-400">Haulers only</span>
          )}
          {load.escrow ? (
            <Link href={`/escrows/${load.escrowId}`} className="font-mono text-[10px] text-denim-300 hover:text-denim-200">{load.escrow.reference} →</Link>
          ) : (
            <span className="text-[10px] text-cream-500">Posted by {load.poster?.name ?? "a seller"}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-xl font-bold text-cream-50">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500">{label}</p>
    </div>
  );
}
