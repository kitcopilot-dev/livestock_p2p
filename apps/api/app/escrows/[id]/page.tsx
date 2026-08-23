import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@livestock/db";
import type { MilestoneKind } from "@livestock/db";
import { Actions } from "../../../components/Actions";
import { Countdown } from "../../../components/Countdown";
import { EvidenceUpload } from "../../../components/EvidenceUpload";
import { PendingPaymentBanner } from "../../../components/PendingPaymentBanner";
import { StatusBadge } from "../../../components/StatusBadge";
import { getDemoRole } from "../../../lib/demoAuth";
import { formatDate, formatLbs, money } from "../../../lib/format";

export const dynamic = "force-dynamic";

const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  CREATED: "Escrow created",
  FUNDED: "Funded — funds locked",
  PICKUP: "Pickup",
  DELIVERED: "Delivered",
  INSPECTION_STARTED: "24h inspection started",
  INSPECTION_DEADLINE: "Inspection window closed",
  DISPUTE_FILED: "Dispute filed",
  DISPUTE_PROOF_DEADLINE: "Proof deadline",
  DISPUTE_RESOLVED: "Dispute resolved",
  RELEASED: "Released — funds paid out",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
  SETTLEMENT_FAILED: "Settlement failed (retrying)",
};

const MILESTONE_DOT: Record<string, string> = {
  CREATED: "bg-cream-500",
  FUNDED: "bg-denim-400",
  PICKUP: "bg-denim-300",
  DELIVERED: "bg-pasture-300",
  INSPECTION_STARTED: "bg-hay-300",
  DISPUTE_FILED: "bg-barn-400",
  DISPUTE_RESOLVED: "bg-plum-400",
  RELEASED: "bg-pasture-400",
  REFUNDED: "bg-teal-300",
  CANCELLED: "bg-cream-500",
  SETTLEMENT_FAILED: "bg-barn-400",
};

const DISPUTE_REASONS: Record<string, string> = {
  QUALITY: "Quality",
  WEIGHT_SHRINK: "Weight shrink",
  VET_CERTIFICATION: "Vet certification",
  NON_DELIVERY: "Non-delivery",
  DAMAGED: "Damaged",
  OTHER: "Other",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function EscrowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getDemoRole();

  const escrow = await prisma.escrowTransaction.findUnique({
    where: { id },
    include: {
      buyer: { select: { name: true, email: true } },
      seller: { select: { name: true, email: true } },
      hauler: { select: { name: true, email: true } },
      load: {
        include: {
          hauler: { select: { name: true } },
        },
      },
      milestones: { orderBy: { occurredAt: "asc" } },
      disputes: {
        orderBy: { filedAt: "desc" },
        include: {
          filedBy: { select: { name: true } },
          evidence: { orderBy: { uploadedAt: "asc" } },
        },
      },
    },
  });

  if (!escrow) notFound();

  // Actions and verdict buttons need the dispute while it is OPEN (proof
  // window) or ARBITRATION_PROCESSING (verdict entry). Evidence upload is
  // gated to the OPEN proof window below.
  const activeDispute =
    escrow.disputes.find((d) => d.status === "OPEN" || d.status === "ARBITRATION_PROCESSING") ?? null;
  const proofDispute = escrow.disputes.find((d) => d.status === "OPEN") ?? null;
  const pricePerLb = escrow.pricePerLbMicros / 1_000_000;
  const hasShrink = escrow.shrinkPenaltyCents !== null && escrow.shrinkPenaltyCents > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/escrows" className="text-sm font-medium text-cream-400 hover:text-cream-200">
          ← Escrows
        </Link>
        <h1 className="font-mono text-xl font-semibold tracking-tight text-cream-50">{escrow.reference}</h1>
        <StatusBadge status={escrow.status} />
      </div>

      {escrow.status === "PENDING_PAYMENT" && (
        <PendingPaymentBanner escrowId={escrow.id} amountCents={escrow.saleAmountCents} />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: money + action */}
        <div className="space-y-4 lg:col-span-2">
          <section className="card card-pad">
            <p className="section-label text-hay-300">Deal breakdown</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MoneyCell label="Sale price" value={money(escrow.saleAmountCents)} accent="text-cream-50" />
              <MoneyCell label="Freight fee" value={money(escrow.freightFeeCents)} accent="text-denim-300" />
              <MoneyCell label="Platform fee" value={money(escrow.platformFeeCents ?? 0)} accent="text-hay-200" />
              <MoneyCell
                label="Shrink penalty"
                value={hasShrink ? `-${money(escrow.shrinkPenaltyCents!)}` : money(0)}
                accent={hasShrink ? "text-barn-200" : "text-cream-500"}
              />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-dirt-700/70 pt-4 text-sm sm:grid-cols-3">
              <InfoRow label="Contracted weight" value={formatLbs(escrow.contractedWeightLbs)} />
              <InfoRow label="Delivered weight" value={formatLbs(escrow.deliveredWeightLbs)} />
              <InfoRow label="Price / lb" value={`$${pricePerLb.toFixed(2)}`} />
              <InfoRow label="Weight tolerance" value={`±${escrow.weightTolerancePct}%`} />
              <InfoRow label="Fee basis points" value={`${escrow.platformFeeBps} bps`} />
              <InfoRow label="Version" value={`v${escrow.version}`} />
            </dl>
          </section>
          {escrow.load && (
            <TransportLeg load={escrow.load} />
          )}
          {(escrow.status === "INSPECTION_PERIOD" || escrow.status === "DISPUTED") && escrow.inspectionDeadlineAt && (
            <Countdown deadline={escrow.inspectionDeadlineAt} label="Inspection window" />
          )}
          {escrow.status === "DISPUTED" && escrow.disputeProofDeadlineAt && (
            <Countdown deadline={escrow.disputeProofDeadlineAt} label="Proof deadline" />
          )}

          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-hay-400" />
              State machine actions
            </h2>
            <div className="mt-3">
              <Actions
                escrow={escrow}
                dispute={activeDispute}
                role={role}
                contractedWeightLbs={escrow.contractedWeightLbs}
              />
            </div>
          </section>

          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-denim-400" />
              Timeline
            </h2>
            <ol className="mt-4 space-y-0">
              {escrow.milestones.map((m, i) => (
                <li key={m.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < escrow.milestones.length - 1 && (
                    <span className="absolute left-[5px] top-4 h-full w-px bg-dirt-600" aria-hidden />
                  )}
                  <span
                    className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${MILESTONE_DOT[m.kind] ?? "bg-cream-500"}`}
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium text-cream-100">{MILESTONE_LABELS[m.kind]}</p>
                    <p className="text-xs text-cream-500">
                      {formatDate(m.occurredAt)}
                      {m.dueAt ? ` · due ${formatDate(m.dueAt)}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        {/* Right column: parties + disputes */}
        <div className="space-y-4">
          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-pasture-400" />
              Parties
            </h2>
            <div className="mt-3 space-y-2">
              <PartyRow label="Buyer" name={escrow.buyer.name ?? escrow.buyer.email} email={escrow.buyer.email} tone="bg-denim-500/25 text-denim-300 border-denim-500/40" />
              <PartyRow label="Seller" name={escrow.seller.name ?? escrow.seller.email} email={escrow.seller.email} tone="bg-pasture-500/25 text-pasture-300 border-pasture-500/40" />
              <PartyRow label="Hauler" name={escrow.hauler.name ?? escrow.hauler.email} email={escrow.hauler.email} tone="bg-hay-500/25 text-hay-300 border-hay-500/40" />
            </div>
          </section>

          <section className="card card-pad">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
              <span className="h-2 w-2 rounded-full bg-barn-400" />
              Disputes
            </h2>
            <div className="mt-3">
              {escrow.disputes.length === 0 ? (
                <p className="text-sm text-cream-500">None filed.</p>
              ) : (
                <ul className="space-y-3">
                  {escrow.disputes.map((d) => (
                    <li key={d.id} className="rounded-xl border border-dirt-600 bg-dirt-900/60 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-cream-100">
                          {DISPUTE_REASONS[d.reason] ?? d.reason}
                        </p>
                        <span
                          className={`pill ${
                            d.status === "OPEN"
                              ? "border-barn-500/60 bg-barn-500/15 text-barn-200"
                              : d.status === "ARBITRATION_PROCESSING"
                                ? "border-plum-500/60 bg-plum-500/15 text-plum-300"
                                : "border-pasture-500/60 bg-pasture-500/15 text-pasture-200"
                          }`}
                        >
                          <span
                            className={`dot ${
                              d.status === "OPEN"
                                ? "bg-barn-400"
                                : d.status === "ARBITRATION_PROCESSING"
                                  ? "bg-plum-400"
                                  : "bg-pasture-400"
                            }`}
                          />
                          {d.status.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </div>
                      {d.description && <p className="mt-1.5 text-xs text-cream-400">{d.description}</p>}
                      <p className="mt-1.5 text-xs text-cream-500">
                        filed by {d.filedBy.name} · {formatDate(d.filedAt)}
                        {d.verdict
                          ? ` · verdict ${d.verdict.replace("RESOLVED_", "").replace("_", " ").toLowerCase()}`
                          : ""}
                      </p>
                      {d.evidence.length > 0 && (
                        <ul className="mt-2.5 space-y-1.5 border-t border-dirt-700/70 pt-2.5">
                          {d.evidence.map((ev) => (
                            <li key={ev.id} className="flex items-center justify-between gap-2 text-xs text-cream-400">
                              <span className="flex min-w-0 items-center gap-2">
                                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-hay-300" aria-hidden>
                                  <path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.5" />
                                  <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.5" />
                                </svg>
                                <span className="truncate">
                                  {(ev.metadata as { fileName?: string } | null)?.fileName ?? ev.fileType.toLowerCase()}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {ev.isVetCertified && <VerifiedTag label="vet" />}
                                {ev.isScaleTicketVerified && <VerifiedTag label="scale" />}
                                <span className="font-mono text-cream-500">{ev.fileSha256.slice(0, 8)}…</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {proofDispute && (
                <div className="mt-4">
                  <EvidenceUpload disputeId={proofDispute.id} escrowId={escrow.id} />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MoneyCell({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-dirt-700/70 bg-dirt-950/50 p-3">
      <p className="section-label">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-0.5 font-medium text-cream-100">{value}</dd>
    </div>
  );
}

function PartyRow({
  label,
  name,
  email,
  tone,
}: {
  label: string;
  name: string;
  email: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dirt-700/70 bg-dirt-950/40 p-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-xs font-semibold ${tone}`}>
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.14em] text-cream-500">{label}</p>
        <p className="truncate text-sm font-semibold text-cream-100">{name}</p>
        <p className="truncate text-xs text-cream-500">{email}</p>
      </div>
    </div>
  );
}

function VerifiedTag({ label }: { label: string }) {
  return (
    <span className="rounded-md bg-pasture-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-pasture-300">
      ✓ {label}
    </span>
  );
}

// --- Transport leg ----------------------------------------------------------

const LOAD_STEPS = [
  { key: "ASSIGNED", label: "Accepted" },
  { key: "IN_TRANSIT", label: "Picked up" },
  { key: "COMPLETED", label: "Delivered" },
] as const;

function TransportLeg({ load }: { load: { id: string; origin: string; destination: string; distanceMiles: number | null; headCount: number; totalWeightLbs: number; freightPayCents: number; status: string; acceptedAt: Date | null; completedAt: Date | null; dueAt: Date | null; hauler: { name: string | null } | null } }) {
  const stepIndex = load.status === "COMPLETED" ? 3 : load.status === "IN_TRANSIT" ? 2 : load.status === "ASSIGNED" ? 1 : 0;
  const label = load.status === "OPEN" ? "Load open — awaiting a hauler" : load.status.toLowerCase().replace("_", " ");

  return (
    <section className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-cream-50">
          <span className="text-base" aria-hidden>🚚</span>
          Transport leg
        </h2>
        <span className={"pill " + (load.status === "COMPLETED" ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : load.status === "IN_TRANSIT" ? "border-barn-500/60 bg-barn-500/15 text-barn-200" : load.status === "ASSIGNED" ? "border-denim-500/60 bg-denim-500/15 text-denim-200" : "border-hay-500/50 bg-hay-500/15 text-hay-200")}>
          <span className={"dot " + (load.status === "COMPLETED" ? "bg-pasture-400" : load.status === "IN_TRANSIT" ? "bg-barn-400" : load.status === "ASSIGNED" ? "bg-denim-400" : "bg-hay-300")} />
          {label}
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-dirt-700/70 bg-dirt-950/50 p-3.5">
        <p className="text-sm font-semibold text-cream-100">
          {load.origin} <span className="text-cream-500">→</span> {load.destination}
        </p>
        <p className="mt-1 text-xs text-cream-500">
          {load.headCount} head · {new Intl.NumberFormat("en-US").format(load.totalWeightLbs)} lb
          {load.distanceMiles ? " · " + load.distanceMiles + " mi" : ""}
          {load.hauler?.name ? " · hauled by " + load.hauler.name : ""}
        </p>
      </div>

      <ol className="mt-5 flex items-center">
        {LOAD_STEPS.map((step, i) => {
          const done = i + 1 < stepIndex || (i + 1 === stepIndex && stepIndex === 3);
          const active = i + 1 === stepIndex;
          const reached = i + 1 <= stepIndex;
          return (
            <li key={step.key} className={"flex items-center " + (i < LOAD_STEPS.length - 1 ? "flex-1" : "")}>
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold ${
                    done
                      ? "border-pasture-400 bg-pasture-500/20 text-pasture-200"
                      : active
                        ? "border-hay-400 bg-hay-500/20 text-hay-200"
                        : reached
                          ? "border-denim-400 bg-denim-500/15 text-denim-200"
                          : "border-dirt-600 bg-dirt-900 text-cream-600"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-cream-400">{step.label}</span>
              </div>
              {i < LOAD_STEPS.length - 1 && (
                <span className={`mx-2 mb-4 h-0.5 flex-1 rounded ${i + 1 <= stepIndex ? "bg-pasture-400/60" : "bg-dirt-600"}`} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dirt-700/70 pt-3 text-xs text-cream-500">
        <span>Freight: <span className="font-semibold text-hay-200">{money(load.freightPayCents)}</span></span>
        {load.acceptedAt && <span>Accepted {formatDate(load.acceptedAt)}</span>}
        {load.completedAt && <span>Delivered {formatDate(load.completedAt)}</span>}
        {load.dueAt && <span>Due {formatDate(load.dueAt)}</span>}
      </div>
    </section>
  );
}
