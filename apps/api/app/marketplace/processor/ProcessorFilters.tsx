"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/* ── Filter option definitions ─────────────────────────── */

const BONE_STATE_OPTIONS = ["Bone-In", "Boneless", "Bone Removed", "Semi-Boneless"];

const CARCASS_OPTIONS = ["Half", "Primal", "Quarter", "Whole"];

const CUT_OPTIONS = ["Beef Cut", "Boxed Beef", "Offal"];

const SUBPRIMAL_OPTIONS = [
  "Brisket", "Chuck", "Flank", "Foreshank", "Ground",
  "Hindquarter", "Hindshank", "Loin", "Offal", "Other",
  "Plate", "Rib", "Round", "Trimming",
];

const TRIM_OPTIONS = [
  "Cap Off", "Center Cut", "Deckle Off", "Defatted",
  "Peeled", "Regular", "Short Cut", "Skinned",
  "Special", "Split", "Trimmed", "Untrimmed",
];

const PACKAGING_OPTIONS = ["Boxed", "Bulk", "Vacuum Sealed"];

const HARVEST_OPTIONS = ["Grass Fed", "Grain Fed", "Pasture Raised", "Grass Finished"];

const HUSBANDRY_OPTIONS = [
  "Grain Fed", "Grass Finished", "Grass Fed",
  "Organic", "Pasture Raised", "Milk Fed",
];

const HEALTH_OPTIONS = ["Healthy", "Sick", "Cripple"];

const CONDITION_OPTIONS = [
  "Stress Cond", "Stress Cond 2", "Stress Cond 3", "Stress Cond Final",
];

const FRAME_OPTIONS = ["Small", "Moderate", "Large", "Extra Large", "Miniature"];

const USDA_GRADE_OPTIONS = ["Prime", "Choice", "Select", "Standard", "Commercial", "Utility", "Cutter", "Canner"];

const IMPS_OPTIONS = [
  "100", "101", "102", "103", "104", "107", "108", "109", "110", "111",
  "112", "113", "114", "115", "116", "117",
];

/* ── Collapsible checkbox group ────────────────────────── */

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

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
            const checked = selected.includes(opt);
            return (
              <li key={opt} className="flex flex-row items-center place-center">
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
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

/* ── Main filter component ─────────────────────────────── */

interface ProcessorFiltersProps {
  boneState: string[];
  carcass: string[];
  cut: string[];
  subprimal: string[];
  trim: string[];
  packaging: string[];
  harvest: string[];
  husbandry: string[];
  healthStatus: string[];
  condition: string[];
  frame: string[];
  usdaGrade: string[];
  imps: string[];
  activeFilterCount: number;
}

export function ProcessorFilters({
  boneState,
  carcass,
  cut,
  subprimal,
  trim,
  packaging,
  harvest,
  husbandry,
  healthStatus,
  condition,
  frame,
  usdaGrade,
  imps,
  activeFilterCount,
}: ProcessorFiltersProps) {
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
      const qs = sp.toString();
      router.push(`/marketplace/processor${qs ? "?" + qs : ""}`);
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

  const clearAllFilters = useCallback(() => {
    router.push("/marketplace/processor");
  }, [router]);

  return (
    <section className="card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-dirt-700/50">
        <h3 className="text-sm font-semibold text-cream-200">
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-hay-500/20 px-1.5 text-[10px] font-bold text-hay-300">
              {activeFilterCount}
            </span>
          )}
        </h3>
        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters} className="text-xs text-cream-500 hover:text-cream-200">
            Clear all
          </button>
        )}
      </div>

      {/* Compact single-column filter list */}
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
        <ul className="flex flex-col gap-3 text-sm p-3 text-cream-400">
          <FilterGroup title="Bone State" options={BONE_STATE_OPTIONS} selected={boneState} onToggle={(v) => toggleMultiValue("boneState", boneState, v)} />
          <FilterGroup title="Carcass" options={CARCASS_OPTIONS} selected={carcass} onToggle={(v) => toggleMultiValue("carcass", carcass, v)} />
          <FilterGroup title="Cut" options={CUT_OPTIONS} selected={cut} onToggle={(v) => toggleMultiValue("cut", cut, v)} />
          <FilterGroup title="Subprimal" options={SUBPRIMAL_OPTIONS} selected={subprimal} onToggle={(v) => toggleMultiValue("subprimal", subprimal, v)} />
          <FilterGroup title="Trim" options={TRIM_OPTIONS} selected={trim} onToggle={(v) => toggleMultiValue("trim", trim, v)} />
          <FilterGroup title="Packaging" options={PACKAGING_OPTIONS} selected={packaging} onToggle={(v) => toggleMultiValue("packaging", packaging, v)} />
          <FilterGroup title="Harvest" options={HARVEST_OPTIONS} selected={harvest} onToggle={(v) => toggleMultiValue("harvest", harvest, v)} />
          <FilterGroup title="Husbandry" options={HUSBANDRY_OPTIONS} selected={husbandry} onToggle={(v) => toggleMultiValue("husbandry", husbandry, v)} />
          <FilterGroup title="Health" options={HEALTH_OPTIONS} selected={healthStatus} onToggle={(v) => toggleMultiValue("healthStatus", healthStatus, v)} />
          <FilterGroup title="Condition" options={CONDITION_OPTIONS} selected={condition} onToggle={(v) => toggleMultiValue("condition", condition, v)} />
          <FilterGroup title="Frame" options={FRAME_OPTIONS} selected={frame} onToggle={(v) => toggleMultiValue("frame", frame, v)} />
          <FilterGroup title="USDA Grade" options={USDA_GRADE_OPTIONS} selected={usdaGrade} onToggle={(v) => toggleMultiValue("usdaGrade", usdaGrade, v)} />
          <FilterGroup title="IMPS" options={IMPS_OPTIONS} selected={imps} onToggle={(v) => toggleMultiValue("imps", imps, v)} />
        </ul>
      </div>
    </section>
  );
}
