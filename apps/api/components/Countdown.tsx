"use client";

import { useEffect, useState } from "react";

export function Countdown({ deadline, label }: { deadline: Date; label: string }) {
  const [remaining, setRemaining] = useState(() => deadline.getTime() - Date.now());

  useEffect(() => {
    const timer = setInterval(() => setRemaining(deadline.getTime() - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const expired = remaining <= 0;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-4 py-3 ${
        expired
          ? "border-barn-500/60 bg-barn-500/10"
          : "border-hay-500/50 bg-gradient-to-r from-hay-500/15 to-hay-500/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-cream-300">
          <span className={`dot ${expired ? "bg-barn-400" : "bg-hay-300 animate-pulse"}`} />
          {label}
        </span>
        <span className={`font-mono text-sm tabular-nums ${expired ? "text-barn-200" : "text-hay-200"}`}>
          {expired ? "expired" : `${pad(h)}:${pad(m)}:${pad(s)}`}
        </span>
      </div>
      {/* progress bar */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-dirt-950/70">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${expired ? "bg-barn-400" : "bg-hay-400"}`}
          style={{ width: expired ? "100%" : "92%" }}
        />
      </div>
    </div>
  );
}
