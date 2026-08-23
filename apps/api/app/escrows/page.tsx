import Link from "next/link";
import { prisma } from "@livestock/db";
import { StatusBadge } from "../../components/StatusBadge";
import { compactMoney, formatDate, formatLbs } from "../../lib/format";

export const dynamic = "force-dynamic";

export default async function EscrowsPage() {
  const escrows = await prisma.escrowTransaction.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      hauler: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-label text-hay-300">State machine</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">Escrows</h1>
          <p className="mt-1 text-sm text-cream-400">
            {escrows.length} transactions · funds locked until inspection clears
          </p>
        </div>
        <Link href="/escrows/new" className="btn-primary">
          + New escrow
        </Link>
      </div>

      {escrows.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm text-cream-400">No escrows yet.</p>
          <Link href="/escrows/new" className="mt-2 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Reference</th>
                <th className="px-5 py-3.5 font-semibold">Route</th>
                <th className="px-5 py-3.5 font-semibold">Weight</th>
                <th className="px-5 py-3.5 font-semibold">Sale</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {escrows.map((escrow) => (
                <tr key={escrow.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="px-5 py-3.5">
                    <Link href={`/escrows/${escrow.id}`} className="font-mono font-medium text-hay-300 hover:text-hay-200">
                      {escrow.reference}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-cream-200">
                    {escrow.buyer.name} → {escrow.seller.name}
                    <span className="block text-xs text-cream-500">hauled by {escrow.hauler.name}</span>
                  </td>
                  <td className="px-5 py-3.5 text-cream-300">
                    {formatLbs(escrow.deliveredWeightLbs ?? escrow.contractedWeightLbs)}
                  </td>
                  <td className="px-5 py-3.5 font-semibold tabular-nums text-cream-100">
                    {compactMoney(escrow.saleAmountCents)}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={escrow.status} />
                  </td>
                  <td className="px-5 py-3.5 text-cream-500">{formatDate(escrow.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
