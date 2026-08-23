"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setDemoRoles } from "../app/actions/demo";
import type { UserRole } from "@livestock/db";

const ROLES: Array<{
  role: UserRole;
  label: string;
  dot: string;
  text: string;
  border: string;
}> = [
  { role: "BUYER", label: "Buyer", dot: "bg-denim-400", text: "text-denim-300", border: "border-denim-400" },
  { role: "SELLER", label: "Seller", dot: "bg-pasture-400", text: "text-pasture-300", border: "border-pasture-400" },
  { role: "HAULER", label: "Hauler", dot: "bg-hay-400", text: "text-hay-300", border: "border-hay-400" },
  { role: "PLATFORM", label: "Platform", dot: "bg-barn-400", text: "text-barn-300", border: "border-barn-400" },
];

function roleMeta(r: UserRole) {
  return ROLES.find((x) => x.role === r)!;
}

/**
 * Compact avatar chip. Clicking opens a dropdown where individual roles are
 * toggled on/off. The chip shows the acting role’s color dot + name, and
 * a count badge when multiple roles are active. At least one role is always
 * kept selected.
 */
export function RoleSwitcher({
  current,
  selected,
}: {
  current: UserRole;
  selected: UserRole[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const meta = roleMeta(current);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function toggle(role: UserRole) {
    if (pending) return;
    const isOn = selected.includes(role);

    let next: UserRole[];
    let primary: UserRole;
    if (isOn) {
      if (selected.length === 1) return;
      next = selected.filter((r) => r !== role);
      primary = role === current ? next[0] : current;
    } else {
      next = [...selected, role];
      primary = role;
    }

    setPending(true);
    await setDemoRoles(next, primary);
    router.refresh();
    setPending(false);
  }

  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      {/* Trigger chip */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-xl border border-dirt-600 bg-dirt-900/90 px-3 py-1.5 text-xs font-semibold shadow-inner transition-colors hover:border-cream-400/30 hover:bg-dirt-800"
      >
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
        <span className="text-cream-100">{meta.label}</span>
        {count > 1 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-cream-500/20 px-1 text-[10px] font-bold text-cream-200">
            +{count - 1}
          </span>
        )}
        <svg
          viewBox="0 0 16 16" fill="none" className={`h-3 w-3 text-cream-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-dirt-600 bg-dirt-900/95 shadow-2xl backdrop-blur-md">
          <div className="p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-cream-500">
              Active roles
            </p>
            {ROLES.map(({ role, label, dot, text, border }) => {
              const on = selected.includes(role);
              const isPrimary = role === current;
              return (
                <button
                  key={role}
                  onClick={() => void toggle(role)}
                  disabled={pending}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    on
                      ? "bg-dirt-800 text-cream-100"
                      : "text-cream-400 hover:bg-dirt-800/60 hover:text-cream-200"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
                    on ? `${border} bg-current/20` : "border-dirt-500 bg-transparent"
                  }`}>
                    {on && (
                      <svg viewBox="0 0 12 12" fill="none" className="h-2.5 w-2.5 text-current">
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className="flex-1">{label}</span>
                  {isPrimary && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-cream-500">primary</span>
                  )}
                </button>
              );
            })}
          </div>
          {count > 1 && (
            <div className="border-t border-dirt-700/60 px-3 py-2 text-[10px] text-cream-500">
              {count} roles active · unioned nav
            </div>
          )}
        </div>
      )}
    </div>
  );
}