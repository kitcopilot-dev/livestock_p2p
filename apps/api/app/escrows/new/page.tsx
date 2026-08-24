import Link from "next/link";
import { createEscrowAction } from "../../actions/escrow";
import { ensureDemoUsers, getDemoRole } from "../../../lib/demoAuth";
import { getPlatformSettings } from "../../../lib/platformSettings";

export const dynamic = "force-dynamic";

export default async function NewEscrowPage() {
  const users = await ensureDemoUsers();
  const [role, platform] = await Promise.all([getDemoRole(), getPlatformSettings()]);
  const options = Object.values(users).map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/escrows" className="text-sm font-medium text-cream-400 hover:text-cream-200">
          ← Escrows
        </Link>
        <p className="section-label mt-3 text-hay-300">New deal</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
          Create an escrow
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-cream-400">
          Funds are held in the platform escrow account and released only after inspection
          clears or arbitration resolves.
        </p>
      </div>

      <form
        action={createEscrowAction as (formData: FormData) => Promise<void>}
        className="card card-pad space-y-5"
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Buyer" hint={role === "BUYER" ? "you" : undefined}>
            <select name="buyerId" defaultValue={users.BUYER.id} className="input">
              {options.map((o) => (
                <option key={o.id} value={o.id} className="bg-dirt-900">
                  {o.name} — {o.role.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Seller" hint={role === "SELLER" ? "you" : undefined}>
            <select name="sellerId" defaultValue={users.SELLER.id} className="input">
              {options.map((o) => (
                <option key={o.id} value={o.id} className="bg-dirt-900">
                  {o.name} — {o.role.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hauler" hint={role === "HAULER" ? "you" : undefined}>
            <select name="haulerId" defaultValue={users.HAULER.id} className="input">
              {options.map((o) => (
                <option key={o.id} value={o.id} className="bg-dirt-900">
                  {o.name} — {o.role.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Sale amount ($)">
            <input name="saleAmount" type="number" min="0" step="0.01" placeholder="25000.00" required className="input" />
          </Field>
          <Field label="Contracted weight (lb)">
            <input name="contractedWeightLbs" type="number" min="1" placeholder="40000" required className="input" />
          </Field>
          <Field label="Freight fee ($)">
            <input name="freightFee" type="number" min="0" step="0.01" placeholder="1500.00" required className="input" />
          </Field>
          <Field label="Weight tolerance (%)">
            <input name="weightTolerancePct" type="number" min="0" max="20" defaultValue={platform.weightTolerancePct} className="input" />
          </Field>
        </div>

        <Field label="Platform fee (bps)">
          <input name="platformFeeBps" type="number" min="0" max="10000" defaultValue={platform.platformFeeBps} className="input" />
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-cream-400">
          <input type="checkbox" name="financed" className="h-4 w-4 rounded border-dirt-600 bg-dirt-900 accent-barn-500" />
          Pay later — {platform.financingWindowDays}-day financing ({((platform.financingFeeBps) / 100).toFixed(1)}% fee)
        </label>
        <p className="-mt-3 text-xs text-cream-500">
          Defers funding to the payment deadline; the escrow auto-cancels if it isn’t funded in time.
        </p>

        <button type="submit" className="btn-primary w-full py-2.5 text-base">
          Create escrow
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
