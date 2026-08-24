import { prisma } from "@livestock/db";
import { getDemoUser, getDemoRoles } from "../../lib/demoAuth";
import { compactMoney, formatDate } from "../../lib/format";
import { getPlatformSettings } from "../../lib/platformSettings";
import { OfferActions } from "../../components/OfferActions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<string, { dot: string; classes: string; label: string }> = {
  PENDING:   { dot: "bg-hay-400",   classes: "border-hay-500/40 bg-hay-500/10 text-hay-200",   label: "Pending" },
  ACCEPTED:  { dot: "bg-pasture-400",classes: "border-pasture-500/50 bg-pasture-500/10 text-pasture-200",label: "Accepted" },
  CONFIRMED: { dot: "bg-denim-400",  classes: "border-denim-500/50 bg-denim-500/10 text-denim-200", label: "Confirmed" },
  DECLINED:  { dot: "bg-cream-500",  classes: "border-dirt-600 bg-dirt-800/60 text-cream-400",  label: "Declined" },
  WITHDRAWN: { dot: "bg-cream-500",  classes: "border-dirt-600 bg-dirt-800/60 text-cream-400",  label: "Withdrawn" },
  EXPIRED:   { dot: "bg-cream-500",  classes: "border-dirt-600 bg-dirt-800/60 text-cream-400",  label: "Expired" },
};

export default async function OffersPage() {
  const [user, roles, platform] = await Promise.all([getDemoUser(), getDemoRoles(), getPlatformSettings()]);
  const isBuyer = roles.includes("BUYER");
  const isSeller = roles.includes("SELLER");

  const [sent, received] = await Promise.all([
    isBuyer
      ? prisma.offer.findMany({
          where: { buyerId: user.id },
          orderBy: { createdAt: "desc" },
          include: {
            items: { include: { listing: { select: { id: true, breed: true, species: true, location: true } } } },
            seller: { select: { id: true, name: true } },
          },
        })
      : ([] as never[]),
    isSeller
      ? prisma.offer.findMany({
          where: { sellerId: user.id },
          orderBy: { createdAt: "desc" },
          include: {
            items: { include: { listing: { select: { id: true, breed: true, species: true, location: true } } } },
            buyer: { select: { id: true, name: true } },
          },
        })
      : ([] as never[]),
  ]);

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="absolute inset-0 bg-gradient-to-br from-pasture-600/15 via-transparent to-hay-500/15" aria-hidden />
        <div className="relative">
          <p className="section-label text-pasture-300">Negotiations</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream-50 sm:text-4xl">
            Offers &amp; <span className="text-hay-300">counter-proposals</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream-300">
            Every offer requires seller approval then buyer confirmation before escrow is created.
            Build multi-listing lots to negotiate volume deals.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {isBuyer && (
          <section>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream-50 mb-4">
              <span className="h-2 w-2 rounded-full bg-hay-400" />
              Offers sent
            </h2>
            {sent.length === 0 ? (
              <div className="card card-pad text-center py-12">
                <span className="text-4xl opacity-30">🤝</span>
                <p className="mt-3 text-sm text-cream-400">No offers sent yet.</p>
                <Link href="/marketplace" className="mt-2 inline-block text-sm font-medium text-hay-300 hover:text-hay-200">Browse the marketplace →</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {sent.map((offer) => <OfferCard key={offer.id} offer={offer} counterparty={offer.seller} role="BUYER" showActions platform={platform} />)}
              </div>
            )}
          </section>
        )}
        {isSeller && (
          <section>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream-50 mb-4">
              <span className="h-2 w-2 rounded-full bg-pasture-400" />
              Offers received
            </h2>
            {received.length === 0 ? (
              <div className="card card-pad text-center py-12">
                <span className="text-4xl opacity-30">📋</span>
                <p className="mt-3 text-sm text-cream-400">No offers received yet.</p>
                <p className="mt-1 text-xs text-cream-500">When a buyer makes an offer on your listings, it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {received.map((offer) => <OfferCard key={offer.id} offer={offer} counterparty={offer.buyer} role="SELLER" showActions platform={platform} />)}
              </div>
            )}
          </section>
        )}
        {!isBuyer && !isSeller && (
          <div className="card card-pad text-center py-16 lg:col-span-2">
            <span className="text-5xl opacity-30">🔒</span>
            <p className="mt-4 text-sm text-cream-400">Switch to Buyer or Seller to view offers.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function OfferCard({ offer, counterparty, role, showActions, platform }: { offer: any; counterparty: { id: string; name: string | null }; role: string; showActions: boolean; platform: { financingWindowDays: number; financingFeeBps: number } }) {
  const chip = STATUS_CHIP[offer.status] ?? STATUS_CHIP.PENDING;
  const breeds = offer.items.map((i: any) => i.listing.breed).join(", ");
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={["pill", chip.classes].join(" ")}><span className={["dot", chip.dot].join(" ")} />{chip.label}</span>
            <span className="text-xs text-cream-500">{offer.reference}</span>
          </div>
          <h3 className="font-display text-base font-semibold text-cream-50 truncate">{breeds}</h3>
          <p className="mt-1 text-sm text-cream-400">
            {offer.items.length} listing{offer.items.length !== 1 ? "s" : ""}
            {counterparty.name && <span> with <span className="text-cream-200">{counterparty.name}</span></span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-bold text-cream-50">{compactMoney(offer.totalAmountCents)}</p>
          <p className="text-[11px] text-cream-500">{offer.priceType === "PER_HEAD" ? "per head" : "per lb"}</p>
        </div>
      </div>
      {offer.message && (
        <p className="mt-3 rounded-lg border border-dirt-600 bg-dirt-800/50 px-3 py-2 text-xs leading-relaxed text-cream-300 italic">
          &ldquo;{offer.message}&rdquo;
        </p>
      )}
      <div className="mt-3 space-y-1 border-t border-dirt-700/50 pt-3">
        {offer.items.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between text-xs">
            <Link href={"/marketplace/" + item.listing.id} className="text-cream-300 hover:text-hay-300 truncate max-w-[60%]">{item.listing.breed} ({item.listing.location})</Link>
            <span className="tabular-nums text-cream-400">{item.quantity} {offer.priceType === "PER_HEAD" ? "head" : "lb"} · {compactMoney(item.lineTotalCents)}</span>
          </div>
        ))}
      </div>
      {offer.destinationFacility && <p className="mt-2 text-xs text-cream-500">Destination: <span className="text-cream-300">{offer.destinationFacility}</span></p>}
      {offer.transportNeeded && <p className="mt-1 text-xs text-pasture-300">Transport requested</p>}
      {offer.declinedReason && <p className="mt-2 text-xs text-barn-300">Reason: {offer.declinedReason}</p>}
      {offer.escrowId && <p className="mt-2 text-xs text-denim-300"><Link href={"/escrows/" + offer.escrowId} className="hover:text-denim-200 underline">View escrow →</Link></p>}
      <div className="mt-3 text-[10px] text-cream-600">
        {formatDate(offer.createdAt)}
        {offer.sellerApprovedAt && " · Seller approved " + formatDate(offer.sellerApprovedAt)}
        {offer.buyerConfirmedAt && " · Buyer confirmed " + formatDate(offer.buyerConfirmedAt)}
      </div>
      {showActions && <div className="mt-4"><OfferActions offer={offer} role={role} financingWindowDays={platform.financingWindowDays} financingFeePct={platform.financingFeeBps / 100} /></div>}
    </div>
  );
}