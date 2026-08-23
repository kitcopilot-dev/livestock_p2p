"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const GENDER_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All genders" },
  { value: "STEER", label: "Steers" },
  { value: "HEIFER", label: "Heifers" },
  { value: "BULL", label: "Bulls" },
  { value: "BARROW", label: "Barrows" },
  { value: "GILT", label: "Gilts" },
  { value: "WETHER", label: "Wethers" },
  { value: "EWE", label: "Ewes" },
  { value: "RAM", label: "Rams" },
  { value: "MIX", label: "Mixed" },
];

const TIER_FILTERS: Array<{ value: string; label: string; emoji: string }> = [
  { value: "", label: "All tiers", emoji: "" },
  { value: "COMMERCIAL", label: "Commercial", emoji: "📋" },
  { value: "REGISTERED", label: "Registered", emoji: "⭐" },
];

const LOAD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All loads" },
  { value: "FULL_LOAD", label: "Full load" },
  { value: "LTL", label: "LTL" },
];

const UNIT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "head", label: "Per head" },
  { value: "pound", label: "Per lb" },
];

interface MarketplaceFiltersProps {
  gender: string;
  tier: string;
  location: string;
  load: string;
  unit: string;
  minPrice: number | null;
  maxPrice: number | null;
  minHead: number | null;
  maxHead: number | null;
  locationOptions: string[];
  activeFilterCount: number;
}

export function MarketplaceFilters({
  gender,
  tier,
  location,
  load,
  unit,
  minPrice,
  maxPrice,
  minHead,
  maxHead,
  locationOptions,
  activeFilterCount,
}: MarketplaceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) {
        sp.set(key, value);
      } else {
        sp.delete(key);
      }
      router.push(`/marketplace?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    router.push("/marketplace?status=ACTIVE");
  }, [router]);

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-cream-200">
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-hay-500/20 px-1.5 text-[10px] font-bold text-hay-300">
              {activeFilterCount}
            </span>
          )}
        </h3>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-cream-500 hover:text-cream-200"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Gender Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
            Gender
          </label>
          <div className="flex flex-wrap gap-1">
            {GENDER_FILTERS.map((g) => (
              <button
                key={g.value}
                onClick={() => updateParam("gender", g.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  gender === g.value || (!gender && !g.value)
                    ? "bg-dirt-700 text-cream-100"
                    : "text-cream-400 hover:text-cream-200 hover:bg-dirt-800"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tier Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
            Tier
          </label>
          <div className="flex flex-wrap gap-1">
            {TIER_FILTERS.map((t) => (
              <button
                key={t.value}
                onClick={() => updateParam("tier", t.value)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  tier === t.value || (!tier && !t.value)
                    ? "bg-dirt-700 text-cream-100"
                    : "text-cream-400 hover:text-cream-200 hover:bg-dirt-800"
                }`}
              >
                {t.emoji && <span>{t.emoji}</span>}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Location Filter */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
            Location
          </label>
          <select
            value={location}
            onChange={(e) => updateParam("location", e.target.value)}
            className="w-full rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
          >
            <option value="">All locations</option>
            {locationOptions.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        {/* Load Type */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
            Load Type
          </label>
          <div className="flex flex-wrap gap-1">
            {LOAD_OPTIONS.map((l) => (
              <button
                key={l.value}
                onClick={() => updateParam("load", l.value)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  load === l.value
                    ? "bg-dirt-700 text-cream-100"
                    : "text-cream-400 hover:text-cream-200 hover:bg-dirt-800"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price + Head Count Range */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Price Range */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
            Price Range (¢/lb)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              defaultValue={minPrice ?? ""}
              onBlur={(e) => updateParam("minPrice", e.target.value)}
              className="w-24 rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
            />
            <span className="text-cream-500">—</span>
            <input
              type="number"
              placeholder="Max"
              defaultValue={maxPrice ?? ""}
              onBlur={(e) => updateParam("maxPrice", e.target.value)}
              className="w-24 rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Head Count Range */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
            Head Count
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              defaultValue={minHead ?? ""}
              onBlur={(e) => updateParam("minHead", e.target.value)}
              className="w-24 rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
            />
            <span className="text-cream-500">—</span>
            <input
              type="number"
              placeholder="Max"
              defaultValue={maxHead ?? ""}
              onBlur={(e) => updateParam("maxHead", e.target.value)}
              className="w-24 rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Unit Toggle */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500">Price display</span>
        <div className="flex items-center gap-1 rounded-lg border border-dirt-600 bg-dirt-800/60 p-0.5">
          {UNIT_OPTIONS.map((u) => (
            <button
              key={u.value}
              onClick={() => updateParam("unit", u.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                unit === u.value
                  ? "bg-gradient-to-b from-hay-400 to-hay-500 text-ink"
                  : "text-cream-400 hover:text-cream-100"
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
