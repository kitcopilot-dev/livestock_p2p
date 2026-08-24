"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptOfferAction,
  declineOfferAction,
  confirmOfferAction,
  withdrawOfferAction,
  type OfferActionResult,
} from "../app/actions/offers";

interface OfferActionsProps {
  offer: {
    id: string;
    status: string;
    escrowId: string | null;
    destinationFacility: string | null;
  };
  role: string;
  financingWindowDays: number;
  financingFeePct: number;
}

export function OfferActions({ offer, role, financingWindowDays, financingFeePct }: OfferActionsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [financed, setFinanced] = useState(false);
  const router = useRouter();

  async function run(fn: () => Promise<OfferActionResult>, label: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    if (!result.ok) {
      setError(result.error ?? label + " failed");
      setPending(false);
      return;
    }
    setPending(false);
    setNotice("Done. Refreshing…");
    router.refresh();
  }

  const s = offer.status;

  if (s === "PENDING" && role === "SELLER") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-success" disabled={pending} onClick={() => run(() => acceptOfferAction(offer.id), "Accept")}>
            Accept
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => declineOfferAction(offer.id), "Decline")}>
            Decline
          </button>
        </div>
        {error && <p className="text-xs text-barn-300">{error}</p>}
        {notice && <p className="text-xs text-pasture-300">{notice}</p>}
      </div>
    );
  }

  if (s === "PENDING" && role === "BUYER") {
    return (
      <div className="space-y-2">
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => withdrawOfferAction(offer.id), "Withdraw")}>
          Withdraw
        </button>
        {error && <p className="text-xs text-barn-300">{error}</p>}
        {notice && <p className="text-xs text-pasture-300">{notice}</p>}
      </div>
    );
  }

  if (s === "ACCEPTED" && role === "BUYER") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => confirmOfferAction(offer.id, offer.destinationFacility ?? undefined, financed), "Confirm")}>
            Confirm &amp; create escrow
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => withdrawOfferAction(offer.id), "Withdraw")}>
            Withdraw
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-cream-400">
          <input
            type="checkbox"
            checked={financed}
            onChange={(e) => setFinanced(e.target.checked)}
            className="h-4 w-4 rounded border-dirt-600 bg-dirt-900 accent-barn-500"
          />
          Pay later — {financingWindowDays}-day financing ({financingFeePct.toFixed(1)}% fee)
        </label>
        <p className="text-xs text-cream-500">This locks in the deal — escrow will be created and funds must be deposited{financed ? " within the payment window" : ""}.</p>
        {error && <p className="text-xs text-barn-300">{error}</p>}
        {notice && <p className="text-xs text-pasture-300">{notice}</p>}
      </div>
    );
  }

  if (s === "CONFIRMED" && offer.escrowId) {
    return (
      <a href={"/escrows/" + offer.escrowId} className="btn-denim inline-block">
        View escrow →
      </a>
    );
  }

  return null;
}