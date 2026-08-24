"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fundEscrowLaterAction } from "../app/actions/escrow";

/**
 * Compact "Pay now" control for a financed (PENDING_PAYMENT) escrow row.
 * Funds the escrow via the transaction manager, then lands on the escrow
 * detail page where the funded state is visible.
 */
export function PayNowShortcut({ escrowId }: { escrowId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);
  const router = useRouter();

  const handlePay = () => {
    setError("");
    startTransition(async () => {
      const res = await fundEscrowLaterAction(escrowId);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setPaid(true);
      router.refresh();
      router.push(`/escrows/${escrowId}`);
    });
  };

  if (paid) {
    return (
      <span className="pill border-pasture-500/60 bg-pasture-500/15 text-pasture-200">
        <span className="dot bg-pasture-400" />
        Funded
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handlePay}
        disabled={pending}
        className="rounded-lg bg-barn-500 px-4 py-1.5 text-xs font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50"
      >
        {pending ? "Paying…" : "Pay now"}
      </button>
      {error && <p className="text-[11px] text-barn-300">{error}</p>}
    </div>
  );
}
