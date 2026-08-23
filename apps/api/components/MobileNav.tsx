"use client";

import { useState } from "react";
import Link from "next/link";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Responsive nav trigger. Renders a hamburger on small screens (the desktop
 * nav is hidden below `sm`) and drops down the role-scoped links the layout
 * already filtered, so mobile users see exactly what their role permits.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Toggle navigation menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-dirt-600 bg-dirt-800/70 text-cream-200 transition-colors hover:border-cream-400/40 hover:text-cream-50"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden>
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-40 w-52 overflow-hidden rounded-xl border border-dirt-700 bg-dirt-900/95 shadow-xl backdrop-blur-md">
          <nav className="flex flex-col p-1.5">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-cream-200 transition-colors hover:bg-dirt-800 hover:text-cream-50"
              >
                {item.label}
              </Link>
            ))}
            {items.length === 0 && (
              <span className="px-3 py-2 text-sm text-cream-500">No pages for this role</span>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
