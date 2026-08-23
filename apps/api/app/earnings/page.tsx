import Link from "next/link";
import { prisma, type LoadStatus } from "@livestock/db";
import { getDemoUser, getDemoRole } from "../../lib/demoAuth";
import { money, formatDate } from "../../lib/format";
import { getBalance } from "@livestock/domain";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<LoadStatus, string> = {
  OPEN: "border-hay-500/60 bg-hay-500/15 text-hay-200",
  ASSIGNED: "border-denim-500/60 bg-denim-500/15 text-denim-200",
  IN_TRANSIT: "border-barn-500/60 bg-barn-500/15 text-barn-200",
  COMPLETED: "border-pasture-500/60 bg-pasture-500/15 text-pasture-200",
  CANCELLED: "border-dirt-600 bg-dirt-800 text-cream-400",
};

export default async function EarningsPage() {
  const [user, role] = await Promise.all([getDemoUser(), getDemoRole()]);
  const isHauler = role === "HAULER";

  const trips = isHauler
    ? await prisma.load.findMany({
        where: { haulerId: user.id },
        orderBy: { createdAt: "desc" },
        include: { escrow: { select: { reference: true, status: true, settlementAt: true } } },
        take: 100,
      })
    : [];

  // Wallet balance from the double-entry ledger — only escrow-settled
  // freight credits to the ledger; standalone freight is paid off-ledger.
  let walletBalanceCents = 0;
  if (isHauler) {
    const wallet = await prisma.ledgerAccount.findUnique({
      where: {
        ownerType_ownerUserId_accountType: {
          ownerType: "USER", ownerUserId: user.id, accountType: "USER_WALLET",
        },
      },
    });
    if (wallet) walletBalanceCents = Number(await getBalance(wallet.id));
  }

  // Payout state: paid when the load is stamped (escrow settlement or
  // standalone completion); pending for completed escrow loads not yet settled.
  const paidTrips = trips.filter((t) => t.paidAt || (!t.escrow && t.status === "COMPLETED"));
  const totalPaidCents = paidTrips.reduce((a, t) => a + t.freightPayCents, 0);
  const pendingTrips = trips.filter((t) => !t.paidAt && t.escrow && t.status === "COMPLETED");
  const totalPendingCents = pendingTrips.reduce((a, t) => a + t.freightPayCents, 0);
  const inFlightTrips = trips.filter((t) => t.status === "ASSIGNED" || t.status === "IN_TRANSIT");
  const totalInFlightCents = inFlightTrips.reduce((a, t) => a + t.freightPayCents, 0);

  // YTD: freight on completed trips whose completion fell this calendar year.
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdTrips = trips.filter((t) => t.status === "COMPLETED" && (t.completedAt ? t.completedAt >= yearStart : false));
  const ytdCents = ytdTrips.reduce((a, t) => a + t.freightPayCents, 0);

  // Reconciliation: standalone freight is paid off-ledger, escrow-settled
  // freight credits the wallet via the ledger. Wallet balance + standalone
  // paid = total paid out shown on the load board.
  const escrowPaidTrips = paidTrips.filter((t) => t.escrow);
  const escrowPaidCents = escrowPaidTrips.reduce((a, t) => a + t.freightPayCents, 0);
  const standalonePaidCents = totalPaidCents - escrowPaidCents;

  // Monthly earnings for the bar chart — group paid trips by year-month.
  const monthlyMap = new Map<string, { cents: number; trips: number }>();
  for (const t of paidTrips) {
    const d = t.paidAt ?? t.completedAt ?? t.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key) ?? { cents: 0, trips: 0 };
    entry.cents += t.freightPayCents;
    entry.trips += 1;
    monthlyMap.set(key, entry);
  }
  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      key,
      label: new Date(key + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      cents: v.cents,
      trips: v.trips,
    }));
  const maxMonthlyCents = Math.max(1, ...monthly.map((m) => m.cents));

  if (!isHauler) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <p className="section-label text-denim-300">Hauler earnings</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">Earnings</h1>
        <div className="card py-12 text-center">
          <span className="text-5xl opacity-30">💵</span>
          <p className="mt-4 text-sm text-cream-400">Switch to the Hauler role to see trip payouts and YTD earnings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-pasture-600/20 via-transparent to-hay-500/15" aria-hidden />
        <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-pasture-400/8 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="section-label text-pasture-300">Hauler earnings</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
            Trip payouts, <span className="text-pasture-300">settled through escrow</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-300">
            Every completed load pays out to your wallet — escrow-linked trips settle when the deal
            closes, standalone freight pays on completion. Your ledger, per trip.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Wallet balance" value={money(walletBalanceCents)} tone="text-pasture-300" />
            <Stat label="Paid out" value={money(totalPaidCents)} tone="text-pasture-200" />
            <Stat label="Pending settlement" value={money(totalPendingCents)} tone="text-hay-200" />
            <Stat label="In flight" value={money(totalInFlightCents)} tone="text-denim-200" />
            <Stat label="YTD (completed trips)" value={money(ytdCents)} tone="text-cream-50" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-cream-500">
            <span>
              <span className="font-semibold text-cream-400">On ledger</span>{' '}
              <span className="font-mono tabular-nums text-pasture-300">{money(walletBalanceCents)}</span>
              {' '}escrow-settled on chain
            </span>
            <span>
              <span className="font-semibold text-cream-400">Off ledger</span>{' '}
              <span className="font-mono tabular-nums text-hay-300">{money(standalonePaidCents)}</span>
              {' '}standalone freight
            </span>
            <span className="hidden sm:inline">
              <span className="mr-1 text-dirt-600">|</span>
              <span className="font-semibold text-cream-400">Total received</span>{' '}
              <span className="font-mono tabular-nums text-cream-50">{money(walletBalanceCents + standalonePaidCents)}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Monthly earnings chart */}
      {monthly.length > 0 && (
        <section className="card p-7 sm:p-9">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-cream-50">Monthly earnings</h2>
              <p className="mt-1 text-sm text-cream-500">Freight paid out per month, by completion date</p>
            </div>
            <span className="font-mono text-sm font-semibold text-pasture-300">
              {monthly.length} months
            </span>
          </div>
          <div className="relative flex items-end gap-3 pt-8" style={{ height: "200px" }}>
            {monthly.map((m) => {
              const barPx = Math.max(Math.round((m.cents / maxMonthlyCents) * 140), 8);
              return (
                <div key={m.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-semibold tabular-nums text-cream-400">
                    {money(m.cents)}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-pasture-600 to-pasture-400"
                    style={{ height: `${barPx}px` }}
                    title={`${m.label}: ${money(m.cents)} (${m.trips} trip${m.trips !== 1 ? "s" : ""})`}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cream-500">
                    {m.label}
                  </span>
                  <span className="text-[9px] text-cream-600">
                    {m.trips} trip{m.trips !== 1 ? "s" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Per-trip payout ledger */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-cream-50">Payout ledger</h2>
            <p className="mt-1 text-sm text-cream-500">Freight pay per trip, with settlement status</p>
          </div>
          <span className="rounded-full border border-pasture-500/50 bg-pasture-500/10 px-3 py-1 text-xs font-semibold text-pasture-200">
            {trips.length} trips
          </span>
        </div>

        {trips.length === 0 ? (
          <div className="card py-16 text-center">
            <span className="text-5xl opacity-30">🚛</span>
            <p className="mt-4 text-sm text-cream-400">No trips yet. Accept a load from the board to start earning.</p>
            <Link href="/loads" className="mt-3 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">Open the load board →</Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Route</th>
                  <th className="px-5 py-3.5 font-semibold">Cargo</th>
                  <th className="px-5 py-3.5 font-semibold">Freight pay</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Settled / paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dirt-700/50">
                {trips.map((t) => {
                  const paid = t.paidAt || (!t.escrow && t.status === "COMPLETED");
                  const settlementDate = t.paidAt ?? (t.escrow?.status === "RESOLVED_DISBURSED" ? t.escrow.settlementAt : null);
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-dirt-800/40">
                      <td className="px-5 py-3.5 font-medium text-cream-100">
                        {t.origin} → {t.destination}
                        {t.distanceMiles ? <span className="ml-1.5 text-xs text-cream-500">{t.distanceMiles} mi</span> : null}
                      </td>
                      <td className="px-5 py-3.5 text-cream-300">{t.headCount} {t.marketplace === "PROCESSOR" ? "units" : "head"} · {new Intl.NumberFormat("en-US").format(t.totalWeightLbs)} lb</td>
                      <td className="px-5 py-3.5 font-semibold tabular-nums text-hay-200">{money(t.freightPayCents)}</td>
                      <td className="px-5 py-3.5">
                        <span className={"pill " + STATUS_STYLES[t.status]}>
                          <span className="dot bg-current opacity-70" />
                          {t.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {paid ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-pasture-200">
                            <span className="text-pasture-400">✓</span>
                            Paid {settlementDate ? formatDate(settlementDate) : ""}
                          </span>
                        ) : t.escrow ? (
                          <span className="text-xs text-cream-500">
                            Pending · <Link href={`/escrows/${t.escrowId}`} className="font-mono text-denim-300 hover:text-denim-200">{t.escrow.reference}</Link>
                          </span>
                        ) : (
                          <span className="text-xs text-cream-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-dirt-700/70 bg-dirt-950/50 p-4">
      <p className={`font-mono text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-500">{label}</p>
    </div>
  );
}
