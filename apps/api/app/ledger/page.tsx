import { prisma } from "@livestock/db";
import { formatDate, money } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const entries = await prisma.ledgerEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      debitAccount: { select: { ownerType: true, ownerUserId: true, accountType: true } },
      creditAccount: { select: { ownerType: true, ownerUserId: true, accountType: true } },
    },
  });

  const userIds = Array.from(
    new Set(entries.flatMap((e) => [e.debitAccount.ownerUserId, e.creditAccount.ownerUserId]).filter(Boolean)),
  );
  const users = await prisma.user.findMany({
    where: { id: { in: userIds as string[] } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));

  const ownerLabel = (ownerType: string, ownerUserId: string | null, accountType: string) => {
    if (ownerType === "PLATFORM") {
      switch (accountType) {
        case "PLATFORM_REVENUE":
          return "Platform revenue";
        case "SUSPENSE":
          return "Suspense";
        default:
          return "Platform escrow";
      }
    }
    return (ownerUserId && names.get(ownerUserId)) || "Unknown";
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="section-label text-hay-300">Double-entry</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">General ledger</h1>
        <p className="mt-1 max-w-2xl text-sm text-cream-400">
          Every row debits one account and credits another; DB triggers enforce zero-sum balance views.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Time</th>
              <th className="px-5 py-3.5 font-semibold">Description</th>
              <th className="px-5 py-3.5 font-semibold">Debit</th>
              <th className="px-5 py-3.5 font-semibold">Credit</th>
              <th className="px-5 py-3.5 text-right font-semibold">Amount</th>
              <th className="px-5 py-3.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dirt-700/50">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-cream-500">
                  No ledger entries yet — fund an escrow to see the double-entry machinery.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="whitespace-nowrap px-5 py-3.5 text-cream-500">{formatDate(e.createdAt)}</td>
                  <td className="max-w-xs truncate px-5 py-3.5 text-cream-200" title={e.description ?? ""}>
                    {e.description ?? "—"}
                  </td>
                  <td className="px-5 py-3.5 text-cream-300">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-cream-500">
                      {e.debitAccount.ownerType}
                    </span>
                    {ownerLabel(e.debitAccount.ownerType, e.debitAccount.ownerUserId, e.debitAccount.accountType)}
                  </td>
                  <td className="px-5 py-3.5 text-cream-300">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-cream-500">
                      {e.creditAccount.ownerType}
                    </span>
                    {ownerLabel(e.creditAccount.ownerType, e.creditAccount.ownerUserId, e.creditAccount.accountType)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-cream-100">{money(e.amountCents)}</td>
                  <td className="px-5 py-3.5">
                                        <span
                      className={`pill ${
                        e.status === "COMMITTED"
                          ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200"
                          : "border-hay-500/60 bg-hay-500/15 text-hay-200"
                      }`}
                    >
                      <span className={`dot ${e.status === "COMMITTED" ? "bg-pasture-400" : "bg-hay-300"}`} />
                      {e.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {entries.length > 0 && (
        <p className="text-xs text-cream-500">
          Escrow-related rows reference the escrow id; toggle the funding/settlement flows in the demo to watch entries post.
        </p>
      )}
    </div>
  );
}
