"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEscrowFromListingAction } from "../app/actions/listings";

type Props = {
  listingId: string;
  financingWindowDays: number;
  financingFeePct: number;
};

export function BuyNowButton({ listingId, financingWindowDays, financingFeePct }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [financed, setFinanced] = useState(false);
  const router = useRouter();

  const handleBuy = () => {
    setError("");
    startTransition(async () => {
      const res = await createEscrowFromListingAction(listingId, financed);
      if (!res.ok) {
        setError(res.error ?? "Could not create the escrow");
        return;
      }
      // On success the server action redirects to the escrow page.
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-cream-400">
        <input
          type="checkbox"
          checked={financed}
          onChange={(e) => setFinanced(e.target.checked)}
          className="h-4 w-4 rounded border-dirt-600 bg-dirt-900 accent-barn-500"
        />
        Pay later — {financingWindowDays}-day financing ({financingFeePct.toFixed(1)}% fee)
      </label>
      <button
        type="button"
        onClick={handleBuy}
        disabled={pending}
        className="btn-primary w-full py-3 text-base disabled:opacity-50"
      >
        {pending ? "Creating escrow…" : financed ? "Buy now — pay later" : "Buy now — escrow protected"}
      </button>
      {error && <p className="text-xs text-barn-300">{error}</p>}
      <p className="text-center text-[10px] text-cream-500">
        Buy now creates and funds an escrow instantly{financed ? " — or defers payment within the financing window" : ""}. Make an offer lets you negotiate price.
      </p>
    </div>
  );
}
