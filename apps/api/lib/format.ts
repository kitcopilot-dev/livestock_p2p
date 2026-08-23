import type { EscrowStatus } from "@livestock/db";

/** Format integer cents as USD, e.g. $123,456.78 */
export function money(centsValue: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(centsValue / 100);
}

/**
 * Compact USD, e.g. $115.0K / $305.2K / $1.4M.
 *
 * Deliberately does NOT use Intl `notation: "compact"`: Node's ICU renders
 * $115K while browsers render $115.0K for the same number, which breaks
 * React hydration (server text != client text). Computing the suffix and
 * rounding ourselves makes the output deterministic on both sides.
 */
export function compactMoney(centsValue: number): string {
  const dollars = centsValue / 100;
  const abs = Math.abs(dollars);
  let value: number;
  let suffix: string;
  if (abs >= 1_000_000) {
    value = dollars / 1_000_000;
    suffix = "M";
  } else if (abs >= 1_000) {
    value = dollars / 1_000;
    suffix = "K";
  } else {
    value = dollars;
    suffix = "";
  }
  // One decimal for K/M (matches the browser's compact rendering exactly),
  // plain whole dollars below $1,000 (both runtimes render "$450" there).
  if (suffix === "") return `$${Math.round(value).toLocaleString("en-US")}`;
  return `$${value.toFixed(1)}${suffix}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatLbs(lbsValue: number | null | undefined): string {
  if (lbsValue === null || lbsValue === undefined) return "—";
  return `${new Intl.NumberFormat("en-US").format(lbsValue)} lb`;
}

/** Convert basis points (e.g. 200 = 2%) to a percentage string like "2.00%". */
export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Convert milliseconds to a human-readable hour string (e.g. "24h", "1.5h"). */
export function msToHours(ms: number): string {
  return `${(ms / 3_600_000).toFixed(ms % 3_600_000 === 0 ? 0 : 1)}h`;
}

const STATUS_STYLES: Record<EscrowStatus, { label: string; dot: string; classes: string }> = {
  DRAFT: { label: "Draft", dot: "bg-cream-500", classes: "border-dirt-600 bg-dirt-800/70 text-cream-300" },
  PENDING_PAYMENT: { label: "Awaiting payment", dot: "bg-hay-400", classes: "border-hay-500/50 bg-hay-500/15 text-hay-200" },
  FUNDED: { label: "Funded", dot: "bg-denim-400", classes: "border-denim-600/50 bg-denim-500/15 text-denim-200" },
  IN_TRANSIT: { label: "In transit", dot: "bg-denim-300", classes: "border-denim-600/50 bg-denim-500/15 text-denim-200" },
  DELIVERED: { label: "Delivered", dot: "bg-pasture-300", classes: "border-pasture-600/50 bg-pasture-500/15 text-pasture-200" },
  INSPECTION_PERIOD: { label: "Inspection (24h)", dot: "bg-hay-300", classes: "border-hay-500/50 bg-hay-500/15 text-hay-200" },
  DISPUTED: { label: "Disputed", dot: "bg-barn-400", classes: "border-barn-500/60 bg-barn-500/15 text-barn-200" },
  ARBITRATION_PROCESSING: { label: "Arbitration", dot: "bg-plum-400", classes: "border-plum-500/60 bg-plum-500/15 text-plum-300" },
  RESOLVED_DISBURSED: { label: "Released", dot: "bg-pasture-400", classes: "border-pasture-500/60 bg-pasture-500/20 text-pasture-200" },
  REFUNDED: { label: "Refunded", dot: "bg-teal-300", classes: "border-teal-700/60 bg-teal-500/15 text-teal-200" },
  CANCELLED: { label: "Cancelled", dot: "bg-cream-500", classes: "border-dirt-600 bg-dirt-800/70 text-cream-400" },
};

export interface StatusStyle {
  label: string;
  dot: string;
  classes: string;
}

export function statusStyle(status: EscrowStatus): StatusStyle {
  return STATUS_STYLES[status];
}
