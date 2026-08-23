"use client";

import { useTransition } from "react";
import { setDemoSpeed } from "../app/actions/demo";
import type { DemoSpeed } from "../lib/demoAuth";

const SPEEDS: Array<{ key: DemoSpeed; label: string; short: string; desc: string; icon: string }> = [
  { key: "normal", label: "24h / 48h", short: "Normal", desc: "Production windows", icon: "🐢" },
  { key: "fast",   label: "60s / 120s", short: "Fast",   desc: "1 min inspection", icon: "🐇" },
  { key: "turbo",   label: "30s / 60s", short: "Turbo",  desc: "30 sec inspection", icon: "🏎️" },
  { key: "hyper",   label: "10s / 20s", short: "Hyper",  desc: "10 sec inspection", icon: "⚡" },
];

export function DemoSpeedControl({ current }: { current: DemoSpeed }) {
  const [pending, startTransition] = useTransition();

  function setSpeed(speed: DemoSpeed) {
    startTransition(async () => {
      await setDemoSpeed(speed);
    });
  }

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-1.5 rounded-lg border border-dirt-600 bg-dirt-800/70 px-2.5 py-1 text-xs font-medium text-cream-300 transition-colors hover:border-hay-500/60 hover:text-cream-100"
        title="Demo speed — shrink inspection & dispute windows"
      >
        <span className="text-sm">⏱️</span>
        <span className="hidden lg:inline">Speed</span>
        <span className="font-mono text-hay-400">{SPEEDS.find((s) => s.key === current)?.short}</span>
      </button>
      <div className="invisible absolute right-0 top-full z-50 mt-2 w-72 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
        <div className="rounded-xl border border-dirt-600 bg-dirt-900 shadow-2xl shadow-black/40">
          <div className="border-b border-dirt-700 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-cream-400">⏱️ Time-Lock Speed</p>
            <p className="mt-0.5 text-[10px] text-cream-500">Shrinks inspection & dispute windows for live demos</p>
          </div>
          <div className="p-1.5">
            {SPEEDS.map((s) => {
              const parts = s.label.split(" / ");
              return (
                <button
                  key={s.key}
                  onClick={() => setSpeed(s.key)}
                  disabled={pending}
                  className={
                    current === s.key
                      ? "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors bg-hay-500/15 text-hay-300"
                      : "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors text-cream-300 hover:bg-dirt-800 hover:text-cream-100"
                  }
                >
                  <span className="text-base">{s.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.short}</span>
                      {current === s.key && (
                        <span className="rounded-full bg-hay-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-hay-300">
                          active
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-cream-500">
                      inspection {parts[0]} · dispute {parts[1] || "—"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
