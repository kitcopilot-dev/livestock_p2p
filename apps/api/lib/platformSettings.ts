import { prisma, type PaymentRail } from "@livestock/db";
import { INSPECTION_WINDOW_MS, DISPUTE_PROOF_WINDOW_MS } from "@livestock/shared";

/**
 * Platform-level configuration knobs. Stored in the PlatformSetting key/value
 * table so an operator can tune escrow economics, time-locked windows, and the
 * payout rail without a code deploy. Every write is audit-logged (append-only,
 * hash-chained) by the settings action.
 *
 * The inspection / dispute-proof windows default to the business-rule
 * constants in @livestock/shared; when present, the stored values override
 * them for new deadlines (see the escrow API/actions). Demo-speed cookie
 * overrides still win in demo mode.
 */

export interface PlatformSettings {
  platformFeeBps: number;
  weightTolerancePct: number;
  freightFeePct: number;
  paymentRail: PaymentRail;
  inspectionWindowMs: number;
  disputeProofWindowMs: number;
}

const DEFAULTS: PlatformSettings = {
  platformFeeBps: 250, // 2.5%
  weightTolerancePct: 2, // ±2%
  freightFeePct: 3, // freight estimate = 3% of sale
  paymentRail: "STRIPE",
  inspectionWindowMs: INSPECTION_WINDOW_MS, // 24h
  disputeProofWindowMs: DISPUTE_PROOF_WINDOW_MS, // 48h
};

const DESCRIPTIONS: Record<string, string> = {
  platformFeeBps: "Platform take on each escrow, in basis points (250 = 2.5%).",
  weightTolerancePct: "Allowed shrink before a weight penalty applies (percent).",
  freightFeePct: "Freight estimate as a percent of sale when a listing becomes a load.",
  paymentRail: "Default payout rail for settlements (STRIPE or DWOLLA).",
  inspectionWindowMs: "Buyer inspection window after delivery, in milliseconds.",
  disputeProofWindowMs: "Evidence submission window after a dispute, in milliseconds.",
};

/** Idempotently seed the settings table with production defaults. */
export async function ensurePlatformSettings(): Promise<void> {
  const entries = Object.entries(DEFAULTS).map(([key, value]) => ({
    key,
    value: String(value),
    description: DESCRIPTIONS[key],
  }));
  await Promise.all(
    entries.map((e) =>
      prisma.platformSetting.upsert({
        where: { key: e.key },
        create: e,
        update: {},
      }),
    ),
  );
}

function intSetting(map: Map<string, string>, key: string, fallback: number): number {
  const raw = map.get(key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Read the effective settings, falling back to defaults for missing keys. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await prisma.platformSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    platformFeeBps: intSetting(map, "platformFeeBps", DEFAULTS.platformFeeBps),
    weightTolerancePct: intSetting(map, "weightTolerancePct", DEFAULTS.weightTolerancePct),
    freightFeePct: intSetting(map, "freightFeePct", DEFAULTS.freightFeePct),
    paymentRail: (map.get("paymentRail") as PaymentRail | undefined) ?? DEFAULTS.paymentRail,
    inspectionWindowMs: intSetting(map, "inspectionWindowMs", DEFAULTS.inspectionWindowMs),
    disputeProofWindowMs: intSetting(map, "disputeProofWindowMs", DEFAULTS.disputeProofWindowMs),
  };
}

export { DEFAULTS };
