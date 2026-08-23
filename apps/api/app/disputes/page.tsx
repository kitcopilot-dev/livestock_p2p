import Link from "next/link";
import { prisma } from "@livestock/db";
import { formatDate } from "../../lib/format";

export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  QUALITY: "Quality",
  WEIGHT_SHRINK: "Weight shrink",
  VET_CERTIFICATION: "Vet certification",
  NON_DELIVERY: "Non-delivery",
  DAMAGED: "Damaged",
  OTHER: "Other",
};

const STATUS_TONES: Record<string, string> = {
  OPEN: "border-barn-500/60 bg-barn-500/15 text-barn-200",
  ARBITRATION_PROCESSING: "border-plum-500/60 bg-plum-500/15 text-plum-300",
  RESOLVED_BUYER_WINS: "border-pasture-500/60 bg-pasture-500/15 text-pasture-200",
  RESOLVED_SELLER_WINS: "border-pasture-500/60 bg-pasture-500/15 text-pasture-200",
  RESOLVED_SPLIT: "border-pasture-500/60 bg-pasture-500/15 text-pasture-200",
};

export default async function DisputesPage() {
  const disputes = await prisma.automatedDispute.findMany({
    orderBy: { filedAt: "desc" },
    include: {
      escrow: { select: { id: true, reference: true, status: true } },
      filedBy: { select: { name: true } },
      _count: { select: { evidence: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="section-label text-barn-300">Programmatic arbitration</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">Disputes</h1>
        <p className="mt-1 max-w-2xl text-sm text-cream-400">
          Evidence with verified flags (vet cert, scale-ticket OCR) drives the settlement vector.
        </p>
      </div>

      {disputes.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm text-cream-400">No disputes yet.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Escrow</th>
                <th className="px-5 py-3.5 font-semibold">Reason</th>
                <th className="px-5 py-3.5 font-semibold">Filed by</th>
                <th className="px-5 py-3.5 font-semibold">Evidence</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Filed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {disputes.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="px-5 py-3.5">
                    <Link href={`/escrows/${d.escrow.id}`} className="font-mono font-medium text-hay-300 hover:text-hay-200">
                      {d.escrow.reference}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-cream-100">{REASON_LABELS[d.reason] ?? d.reason}</td>
                  <td className="px-5 py-3.5 text-cream-300">{d.filedBy.name}</td>
                  <td className="px-5 py-3.5 tabular-nums text-cream-300">{d._count.evidence}</td>
                  <td className="px-5 py-3.5">
                    <span className={`pill ${STATUS_TONES[d.status] ?? "border-dirt-600 bg-dirt-800 text-cream-300"}`}>
                      <span className={`dot ${d.status === "OPEN" ? "bg-barn-400" : d.status === "ARBITRATION_PROCESSING" ? "bg-plum-400" : "bg-pasture-400"}`} />
                      {d.status.replaceAll("_", " ").toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-cream-500">{formatDate(d.filedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
