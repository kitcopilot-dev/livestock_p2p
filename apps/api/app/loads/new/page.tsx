import { redirect } from "next/navigation";
import Link from "next/link";
import { createFreightLoadAction } from "../../actions/listings";
import { getDemoRole } from "../../../lib/demoAuth";

export const dynamic = "force-dynamic";

const STANDALONE_FREIGHT = process.env.FEATURE_STANDALONE_FREIGHT === "true";

const SPECIES_OPTIONS = ["CATTLE", "HOG", "SHEEP", "GOAT"];

export default async function NewLoadPage() {
  if (!STANDALONE_FREIGHT) redirect("/loads");

  const role = await getDemoRole();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/loads" className="text-sm font-medium text-cream-400 hover:text-cream-200">
          &larr; Load board
        </Link>
        <p className="section-label mt-3 text-denim-300">Freight posting</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
          Post a load
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-cream-400">
          Create a standalone freight job on the load board. Verified haulers can accept it and
          handle the transport — no marketplace sale required.
        </p>
        {role !== "SELLER" && (
          <p className="mt-3 inline-block rounded-full border border-hay-500/50 bg-hay-500/10 px-3 py-1.5 text-xs font-medium text-hay-200">
            Switch to the Seller role to post loads.
          </p>
        )}
      </div>

      <form action={createFreightLoadAction as (formData: FormData) => Promise<void>} className="card card-pad space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Pickup origin" hint="city, state">
            <input name="origin" type="text" placeholder="Tulsa, OK" required className="input" />
          </Field>
          <Field label="Delivery destination" hint="city, state">
            <input name="destination" type="text" placeholder="Dallas, TX" required className="input" />
          </Field>
          <Field label="Distance (miles)" hint="optional">
            <input name="distanceMiles" type="number" min="0" placeholder="240" className="input" />
          </Field>
          <Field label="Load type">
            <select name="loadType" className="input">
              <option value="FULL_LOAD" className="bg-dirt-900">Full load</option>
              <option value="LTL" className="bg-dirt-900">LTL (less than truckload)</option>
            </select>
          </Field>
          <Field label="Species">
            <select name="species" className="input">
              {SPECIES_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-dirt-900">{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Head count">
            <input name="headCount" type="number" min="1" placeholder="120" required className="input" />
          </Field>
          <Field label="Total weight (lb)">
            <input name="totalWeightLbs" type="number" min="1" placeholder="150000" required className="input" />
          </Field>
          <Field label="Freight pay ($)" hint="what you will pay the hauler">
            <input name="freightPay" type="number" min="0" step="0.01" placeholder="950.00" required className="input" />
          </Field>
          <Field label="Deliver by" hint="optional — feeds the hauler's on-time rate">
            <input name="dueAt" type="datetime-local" className="input" />
          </Field>
        </div>

        <div className="rounded-xl border border-denim-500/30 bg-denim-500/10 p-4">
          <p className="text-sm font-medium text-denim-200">
            💡 How payment works
          </p>
          <p className="mt-1 text-xs leading-relaxed text-cream-400">
            Freight-only jobs are settled directly with the hauler on completion. Sale-derived loads
            on the board are paid through the escrow settlement when the deal closes. Set an optional
            deliver-by date and it counts toward the hauler&apos;s on-time rate.
          </p>
        </div>

        <button type="submit" className="btn-primary w-full py-2.5 text-base">
          Post load to the board
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-cream-200">
      {label}
      {hint && <span className="ml-1 font-normal text-cream-500">({hint})</span>}
      {children}
    </label>
  );
}
