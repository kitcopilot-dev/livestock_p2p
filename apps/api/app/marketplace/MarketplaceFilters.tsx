"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/* ── Filter option definitions ─────────────────────────── */

const AGE_OPTIONS = [
  "Less than 1 year",
  "1-2 years",
  "2-3 years",
  "3-4 years",
  "4-5 years",
  "5-6 years",
  "6-7 years",
  "7-8 years",
  "8-9 years",
  "9-10 years",
  "10-11 years",
  "11-12 years",
  "12+ years",
];

const FRAME_OPTIONS = ["Small", "Moderate", "Large", "Extra Large", "Miniature"];

const HARVEST_OPTIONS = [
  "Grass Fed",
  "Grain Fed",
  "Pasture Raised",
  "Grass Finished",
];

const HUSBANDRY_OPTIONS = [
  "Grain Fed",
  "Grass Finished",
  "Grass Fed",
  "Organic",
  "Pasture Raised",
  "Milk Fed",
];

const HEALTH_OPTIONS = ["Healthy", "Sick", "Cripple"];

const FERTILITY_OPTIONS = ["Not Tested", "Positive", "Negative"];

const CONDITION_OPTIONS = [
  "Stress Cond",
  "Stress Cond 2",
  "Stress Cond 3",
  "Stress Cond Final",
];

const GENDER_OPTIONS = [
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

const TIER_OPTIONS = [
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "REGISTERED", label: "Registered" },
];

const LOAD_OPTIONS = [
  { value: "FULL_LOAD", label: "Full load" },
  { value: "LTL", label: "LTL" },
];

/* ── Collapsible checkbox group ────────────────────────── */

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
  multiSelect = true,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  multiSelect?: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-cream-300 hover:text-cream-100 transition-colors"
        >
          {/* Checkbox icon (WeGotBeef pattern) */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="h-3 w-3 shrink-0"
          >
            <path
              d="M8.75 1.25H3.25C2.14543 1.25 1.25 2.14543 1.25 3.25V8.75C1.25 9.85457 2.14543 10.75 3.25 10.75H8.75C9.85457 10.75 10.75 9.85457 10.75 8.75V3.25C10.75 2.14543 9.85457 1.25 8.75 1.25Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.25 6H3.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-start">{title}</span>
          {/* Chevron */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path
              d="M3 1.5L7 5L3 8.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {open && (
        <ul className="flex flex-col gap-2 text-xs text-cream-400 pl-5 w-full">
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <li
                key={opt}
                className="flex flex-row items-center place-center"
              >
                <label className="flex items-center gap-1 hover:text-cream-200 transition-colors cursor-pointer">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => onToggle(opt)}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded border mr-2 shrink-0 transition-colors ${
                      checked
                        ? "border-hay-400 bg-hay-500 text-ink"
                        : "border-dirt-500 bg-dirt-900 text-transparent"
                    }`}
                  >
                    {checked && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2.5 6L5 8.5L9.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <span>{opt}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/* ── Value-based group (for gender, tier, load) ───────── */

function ValueFilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-cream-300 hover:text-cream-100 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="h-3 w-3 shrink-0"
          >
            <path
              d="M8.75 1.25H3.25C2.14543 1.25 1.25 2.14543 1.25 3.25V8.75C1.25 9.85457 2.14543 10.75 3.25 10.75H8.75C9.85457 10.75 10.75 9.85457 10.75 8.75V3.25C10.75 2.14543 9.85457 1.25 8.75 1.25Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.25 6H3.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-start">{title}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path
              d="M3 1.5L7 5L3 8.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {open && (
        <ul className="flex flex-col gap-2 text-xs text-cream-400 pl-5 w-full">
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <li
                key={opt.value}
                className="flex flex-row items-center place-center"
              >
                <label className="flex items-center gap-1 hover:text-cream-200 transition-colors cursor-pointer">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => onToggle(opt.value)}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded border mr-2 shrink-0 transition-colors ${
                      checked
                        ? "border-hay-400 bg-hay-500 text-ink"
                        : "border-dirt-500 bg-dirt-900 text-transparent"
                    }`}
                  >
                    {checked && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2.5 6L5 8.5L9.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                  <span>{opt.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/* ── Main filter component ─────────────────────────────── */

interface MarketplaceFiltersProps {
  gender: string[];
  tier: string[];
  location: string;
  load: string[];
  unit: string;
  minPrice: number | null;
  maxPrice: number | null;
  minHead: number | null;
  maxHead: number | null;
  locationOptions: string[];
  activeFilterCount: number;
  // New checkbox filter values (comma-separated in URL)
  ageRange: string[];
  frame: string[];
  harvest: string[];
  husbandry: string[];
  healthStatus: string[];
  fertility: string[];
  condition: string[];
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
  ageRange,
  frame,
  harvest,
  husbandry,
  healthStatus,
  fertility,
  condition,
}: MarketplaceFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setMultiParam = useCallback(
    (key: string, values: string[]) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (values.length > 0) {
        sp.set(key, values.join(","));
      } else {
        sp.delete(key);
      }
      router.push(`/marketplace?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const toggleMultiValue = useCallback(
    (key: string, current: string[], value: string) => {
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setMultiParam(key, next);
    },
    [setMultiParam],
  );

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
    <section className="card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3 border-b border-dirt-700/50">
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
            Clear all
          </button>
        )}
      </div>

      <div className="flex">
        {/* Sidebar filter groups */}
        <div className="w-full border-r border-dirt-700/50 max-h-[70vh] overflow-y-auto">
          <ul className="flex flex-col gap-4 text-sm p-3 text-cream-400">
            {/* Gender */}
            <ValueFilterGroup
              title="Gender"
              options={GENDER_OPTIONS}
              selected={gender}
              onToggle={(v) => toggleMultiValue("gender", gender, v)}
            />

            {/* Tier */}
            <ValueFilterGroup
              title="Tier"
              options={TIER_OPTIONS}
              selected={tier}
              onToggle={(v) => toggleMultiValue("tier", tier, v)}
            />

            {/* Age */}
            <FilterGroup
              title="Age"
              options={AGE_OPTIONS}
              selected={ageRange}
              onToggle={(v) => toggleMultiValue("ageRange", ageRange, v)}
            />

            {/* Frame */}
            <FilterGroup
              title="Frame"
              options={FRAME_OPTIONS}
              selected={frame}
              onToggle={(v) => toggleMultiValue("frame", frame, v)}
            />

            {/* Condition / BCS */}
            <FilterGroup
              title="Condition"
              options={CONDITION_OPTIONS}
              selected={condition}
              onToggle={(v) => toggleMultiValue("condition", condition, v)}
            />

            {/* Harvest */}
            <FilterGroup
              title="Harvest"
              options={HARVEST_OPTIONS}
              selected={harvest}
              onToggle={(v) => toggleMultiValue("harvest", harvest, v)}
            />

            {/* Husbandry */}
            <FilterGroup
              title="Husbandry"
              options={HUSBANDRY_OPTIONS}
              selected={husbandry}
              onToggle={(v) => toggleMultiValue("husbandry", husbandry, v)}
            />

            {/* Health */}
            <FilterGroup
              title="Health"
              options={HEALTH_OPTIONS}
              selected={healthStatus}
              onToggle={(v) => toggleMultiValue("healthStatus", healthStatus, v)}
            />

            {/* Fertility */}
            <FilterGroup
              title="Fertility"
              options={FERTILITY_OPTIONS}
              selected={fertility}
              onToggle={(v) => toggleMultiValue("fertility", fertility, v)}
            />

            {/* Load Type */}
            <ValueFilterGroup
              title="Load Type"
              options={LOAD_OPTIONS}
              selected={load}
              onToggle={(v) => toggleMultiValue("load", load, v)}
            />

            {/* Location */}
            <li className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-cream-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="h-3 w-3 shrink-0"
                  >
                    <path
                      d="M8.75 1.25H3.25C2.14543 1.25 1.25 2.14543 1.25 3.25V8.75C1.25 9.85457 2.14543 10.75 3.25 10.75H8.75C9.85457 10.75 10.75 9.85457 10.75 8.75V3.25C10.75 2.14543 9.85457 1.25 8.75 1.25Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.25 6H3.75"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-start">Location</span>
                </span>
              </div>
              <select
                value={location}
                onChange={(e) => updateParam("location", e.target.value)}
                className="ml-5 w-[calc(100%-1.25rem)] rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
              >
                <option value="">All locations</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </li>
          </ul>
        </div>

        {/* Price + Head Range (right side) */}
        <div className="w-full max-w-xs p-3 flex flex-col gap-4">
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

          {/* Head Count */}
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

          {/* Unit Toggle */}
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-cream-500 mb-1.5">
              Price display
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-dirt-600 bg-dirt-800/60 p-0.5">
              {["all", "head", "pound"].map((u) => (
                <button
                  key={u}
                  onClick={() => updateParam("unit", u)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    unit === u
                      ? "bg-gradient-to-b from-hay-400 to-hay-500 text-ink"
                      : "text-cream-400 hover:text-cream-100"
                  }`}
                >
                  {u === "all" ? "All" : u === "head" ? "Per head" : "Per lb"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
