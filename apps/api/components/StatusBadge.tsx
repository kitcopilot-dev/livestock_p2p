import type { EscrowStatus } from "@livestock/db";
import { statusStyle } from "../lib/format";

export function StatusBadge({ status }: { status: EscrowStatus }) {
  const style = statusStyle(status);
  return (
    <span className={`pill ${style.classes}`}>
      <span className={`dot ${style.dot}`} />
      {style.label}
    </span>
  );
}
