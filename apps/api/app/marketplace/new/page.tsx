import Link from "next/link";
import { createListingAction } from "../../actions/listings";
import { getDemoRole } from "../../../lib/demoAuth";

export const dynamic = "force-dynamic";

const SPECIES_OPTIONS = ["CATTLE", "HOG", "SHEEP", "GOAT"];
const GENDER_OPTIONS = ["STEER", "HEIFER", "BULL", "BARROW", "GILT", "WETHER", "EWE", "RAM", "MIX"];
const BREED_SUGGESTIONS = [
  "Angus", "Hereford", "Charolais", "Brangus", "Simmental", "Limousin",
  "Corriente", "Beefmaster", "Akaushi", "Amerifax", "Holstein", "Jersey",
  "Dorper", "Katahdin", "Suffolk", "Boer", "Kiko", "Berkshire", "Duroc", "Yorkshire",
];

export default async function NewListingPage() {
  const role = await getDemoRole();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/marketplace" className="text-sm font-medium text-cream-400 hover:text-cream-200">
          &larr; Marketplace
        </Link>
        <p className="section-label mt-3 text-pasture-300">New listing</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
          List livestock for sale
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-cream-400">
          Create a listing on the marketplace. Buyers can purchase through escrow-protected transactions.
        </p>
      </div>

      <form action={createListingAction as (formData: FormData) => Promise<void>} className="card card-pad space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Species">
            <select name="species" className="input">
              {SPECIES_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-dirt-900">{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Breed" hint="pick or type">
            <input name="breed" type="text" placeholder="Angus" required list="breed-suggestions" className="input" />
            <datalist id="breed-suggestions">
              {BREED_SUGGESTIONS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Gender">
            <select name="gender" className="input">
              <option value="" className="bg-dirt-900">Select gender</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g} className="bg-dirt-900">{g.charAt(0) + g.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Head count" hint="number of animals">
            <input name="headCount" type="number" min="1" placeholder="120" required className="input" />
          </Field>
          <Field label="Avg weight (lb)">
            <input name="avgWeightLbs" type="number" min="1" placeholder="1250" required className="input" />
          </Field>
        </div>

        {/* Pricing */}
        <div className="rounded-xl border border-dirt-700/70 bg-dirt-950/40 p-4">
          <p className="text-sm font-semibold text-cream-100">Pricing</p>
          <p className="mt-0.5 text-xs text-cream-500">How do you want to quote this lot?</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-dirt-600 bg-dirt-800/60 p-3 cursor-pointer hover:border-hay-500/40">
              <input type="radio" name="priceType" value="PER_POUND" defaultChecked className="accent-hay-400" />
              <span>
                <span className="block text-sm font-medium text-cream-100">Per pound</span>
                <span className="text-xs text-cream-500">Quote $/lb on live weight</span>
              </span>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-dirt-600 bg-dirt-800/60 p-3 cursor-pointer hover:border-hay-500/40">
              <input type="radio" name="priceType" value="PER_HEAD" className="accent-hay-400" />
              <span>
                <span className="block text-sm font-medium text-cream-100">Per head</span>
                <span className="text-xs text-cream-500">Quote a flat $ per animal</span>
              </span>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-cream-200">
              Price per lb ($)
              <input name="pricePerLb" type="number" min="0" step="0.01" placeholder="2.50" className="input" />
            </label>
            <label className="block text-sm font-semibold text-cream-200">
              Price per head ($)
              <input name="pricePerHead" type="number" min="0" step="0.01" placeholder="2650.00" className="input" />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-cream-500">Fill the price for your chosen unit — the other can stay empty.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Load type">
            <select name="loadType" className="input">
              <option value="FULL_LOAD" className="bg-dirt-900">Full load</option>
              <option value="LTL" className="bg-dirt-900">LTL (less than truckload)</option>
            </select>
          </Field>
          <Field label="Tier">
            <select name="tier" className="input">
              <option value="COMMERCIAL" className="bg-dirt-900">Commercial</option>
              <option value="REGISTERED" className="bg-dirt-900">Registered</option>
            </select>
          </Field>
          <Field label="Age range" hint="optional">
            <input name="ageRange" type="text" placeholder="12-18 months" className="input" />
          </Field>
          <Field label="Health status" hint="optional">
            <input name="healthStatus" type="text" placeholder="Healthy, USDA inspected" className="input" />
          </Field>
          <Field label="Location" hint="city, state">
            <input name="location" type="text" placeholder="Oklahoma City, OK" required className="input" />
          </Field>
          <Field label="ZIP code" hint="optional">
            <input name="zipCode" type="text" placeholder="73102" className="input" />
          </Field>
        </div>

        {/* Classification fields (the "Cattle Fields" table) */}
        <div className="rounded-xl border border-dirt-700/70 bg-dirt-950/40 p-4">
          <p className="text-sm font-semibold text-cream-100">Classification fields</p>
          <p className="mt-0.5 text-xs text-cream-500">Optional details shown in the listing&apos;s spec table — breeds, feeding program, health, etc.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Origin" hint="optional">
              <input name="origin" type="text" placeholder="Oklahoma City, OK" className="input" />
            </Field>
            <Field label="Registry" hint="optional">
              <input name="registry" type="text" placeholder="American Hereford Association" className="input" />
            </Field>
            <Field label="Class" hint="optional">
              <input name="listingClass" type="text" placeholder="Steers / Heifers / Calves" className="input" />
            </Field>
            <Field label="Subclass" hint="optional">
              <input name="subclass" type="text" placeholder="e.g. heavy feeder" className="input" />
            </Field>
            <Field label="Husbandry" hint="optional">
              <input name="husbandry" type="text" placeholder="Grain-fed (150 days)" className="input" />
            </Field>
            <Field label="Frame" hint="optional">
              <input name="frame" type="text" placeholder="Large / Medium / Small" className="input" />
            </Field>
            <Field label="Vaccines" hint="optional">
              <input name="vaccines" type="text" placeholder="7-way blackleg, IBR/BVD" className="input" />
            </Field>
            <Field label="Condition" hint="optional">
              <input name="condition" type="text" placeholder="BCS 5.5" className="input" />
            </Field>
            <Field label="Fertility" hint="optional">
              <input name="fertility" type="text" placeholder="Breeding soundness examined" className="input" />
            </Field>
            <Field label="Registry type" hint="optional">
              <input name="registryType" type="text" placeholder="Registered / Commercial" className="input" />
            </Field>
            <Field label="Birth weight (lb)" hint="optional">
              <input name="birthWeightLbs" type="number" min="0" placeholder="82" className="input" />
            </Field>
          </div>
        </div>

        <Field label="Description">
          <textarea name="description" rows={4} placeholder="Describe the lot: feeding program, weight gain, vaccination history, etc." className="input" />
        </Field>

        <button type="submit" className="btn-primary w-full py-2.5 text-base">
          Create listing
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
