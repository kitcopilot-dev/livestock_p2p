"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AutomatedDispute, EscrowTransaction, UserRole } from "@livestock/db";
import {
  advanceEscrowAction,
  cancelEscrowAction,
  escalateDisputeAction,
  fileDisputeAction,
  resolveDisputeAction,
  type ActionResult,
} from "../app/actions/escrow";
import type { DisputeVerdict } from "@livestock/domain";

interface ActionsProps {
  escrow: EscrowTransaction;
  dispute: AutomatedDispute | null;
  role: UserRole;
  contractedWeightLbs: number;
}

function Btn({
  children,
  onClick,
  tone = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "danger" | "ghost" | "success";
  disabled?: boolean;
}) {
  const tones = {
    primary: "btn-primary",
    danger: "btn-danger",
    ghost: "btn-ghost",
    success: "btn-success",
  } as const;
  return (
    <button onClick={onClick} disabled={disabled} className={tones[tone]}>
      {children}
    </button>
  );
}

export function Actions({ escrow, dispute, role, contractedWeightLbs }: ActionsProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [weight, setWeight] = useState<string>(String(contractedWeightLbs));
  const [reason, setReason] = useState("QUALITY");
  const [description, setDescription] = useState("");
  const router = useRouter();

  async function run(key: string, fn: () => Promise<ActionResult>) {
    setPending(key);
    setError(null);
    setNotice(null);
    const result = await fn();
    if (!result.ok) {
      setError(result.error ?? "action failed");
      setPending(null);
      return;
    }
    setPending(null);
    setNotice("Saved. Refreshing…");
    router.refresh();
  }

  const status = escrow.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "DRAFT" && (role === "BUYER" || role === "PLATFORM") && (
          <Btn disabled={pending !== null} onClick={() => void run("fund", () => advanceEscrowAction(escrow.id, "fund"))}>
            Fund escrow
          </Btn>
        )}
        {status === "FUNDED" && (role === "HAULER" || role === "PLATFORM") && (
          <Btn disabled={pending !== null} onClick={() => void run("inTransit", () => advanceEscrowAction(escrow.id, "inTransit"))}>
            Mark in transit
          </Btn>
        )}
        {status === "FUNDED" && (role === "BUYER" || role === "PLATFORM") && (
          <Btn tone="danger" disabled={pending !== null} onClick={() => void run("cancel", () => cancelEscrowAction(escrow.id))}>
            Cancel escrow
          </Btn>
        )}
        {status === "IN_TRANSIT" && (role === "HAULER" || role === "PLATFORM") && (
          <>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="Delivered weight (lb)"
              className="w-40 rounded-lg border border-dirt-600 bg-dirt-950 px-2.5 py-1.5 text-sm text-cream-100 focus:border-hay-400 focus:outline-none"
            />
            <Btn disabled={pending !== null} onClick={() => void run("delivered", () => advanceEscrowAction(escrow.id, "delivered", Number(weight) || null))}>
              Mark delivered
            </Btn>
          </>
        )}
        {status === "DISPUTED" && role === "PLATFORM" && dispute && (
          <Btn disabled={pending !== null} onClick={() => void run("arbitrate", () => escalateDisputeAction(dispute.id))}>
            Escalate to arbitration
          </Btn>
        )}
        {status === "ARBITRATION_PROCESSING" && role === "PLATFORM" && dispute && (
          <>
            {(["RESOLVED_BUYER_WINS", "RESOLVED_SELLER_WINS", "RESOLVED_SPLIT"] as DisputeVerdict[]).map((v) => (
              <Btn
                key={v}
                tone={v === "RESOLVED_SPLIT" ? "success" : "primary"}
                disabled={pending !== null}
                onClick={() => void run(`resolve:${v}`, () => resolveDisputeAction(dispute.id, v))}
              >
                {v.replace("RESOLVED_", "").replace("_", " ").toLowerCase()}
              </Btn>
            ))}
          </>
        )}
        {status === "INSPECTION_PERIOD" && role === "BUYER" && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <label className="text-xs font-medium text-cream-300">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 block w-44 rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-sm text-cream-100"
              >
                <option value="QUALITY">Quality</option>
                <option value="WEIGHT_SHRINK">Weight shrink</option>
                <option value="VET_CERTIFICATION">Vet certification</option>
                <option value="NON_DELIVERY">Non-delivery</option>
                <option value="DAMAGED">Damaged</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-xs font-medium text-cream-300">
              Details
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 block w-64 rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-sm text-cream-100"
              />
            </label>
            <Btn
              tone="danger"
              disabled={pending !== null}
              onClick={() => {
                const data = new FormData();
                data.set("reason", reason);
                data.set("description", description);
                void run("dispute", () => fileDisputeAction(escrow.id, data));
              }}
            >
              File dispute
            </Btn>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-barn-500/40 bg-barn-500/10 px-3 py-2 text-sm text-barn-200">
          {error}
        </div>
      )}
      {notice && <div className="text-sm text-pasture-300">{notice}</div>}

      {["DRAFT", "FUNDED", "IN_TRANSIT", "INSPECTION_PERIOD", "DISPUTED"].includes(status) && (
        <p className="text-xs text-cream-500">
          Demo hint: switch role in the header to act as the party that owns the next step
          (buyer funds and disputes, hauler marks transit/delivery, platform arbitrates).
        </p>
      )}
    </div>
  );
}
