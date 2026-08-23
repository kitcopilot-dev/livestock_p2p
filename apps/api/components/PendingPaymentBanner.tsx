"use client";

import { useState, useTransition } from "react";
import { fundEscrowLaterAction } from "../app/actions/escrow";

type Props = {
  escrowId: string;
  amountCents: number;
};

export function PendingPaymentBanner({ escrowId, amountCents }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [funded, setFunded] = useState(false);

  const handlePay = () => {
    setError("");
    startTransition(async () => {
      const res = await fundEscrowLaterAction(escrowId);
      if ("error" in res && res.error) {
        setError(res.error);
      } else {
        setFunded(true);
      }
    });
  };

  if (funded) {
    return (
      <div className="rounded-xl border border-pasture-500/30 bg-pasture-500/10 p-4">
        <p className="text-sm font-medium text-pasture-300">
          ✅ Payment received — escrow is now funded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-hay-500/30 bg-hay-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-hay-300">
            💰 Payment Pending — ${(amountCents / 100).toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-cream-500">
            This escrow was created with deferred payment. Fund it to proceed.
          </p>
        </div>
        <button
          onClick={handlePay}
          disabled={pending}
          className="rounded-lg bg-barn-500 px-5 py-2 text-sm font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50"
        >
          {pending ? "Processing..." : "Pay Now"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
