"use client";

import { useState } from "react";

export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState<"dark" | "light">(initial);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    // Flip instantly, then persist for the next server render.
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-dirt-600 bg-dirt-800/60 text-sm transition-all duration-150 hover:border-hay-400/60 hover:bg-dirt-700 active:scale-95"
    >
      {theme === "dark" ? (
        /* sun */
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-hay-300" aria-hidden>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        /* moon */
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-denim-300" aria-hidden>
          <path
            d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
