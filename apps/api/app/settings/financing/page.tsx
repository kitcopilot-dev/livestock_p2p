import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@livestock/db";
import { getDemoRole, getDemoUser } from "../../../lib/demoAuth";
import { getCurrentUser, isDemoMode } from "../../../lib/auth";
import { ensurePlatformSettings, getPlatformSettings } from "../../../lib/platformSettings";
import { updatePlatformSettingsAction } from "../../actions/settings";
import { formatDate, bpsToPct } from "../../../lib/format";

export const dynamic = "force-dynamic";

const FINANCING_LABELS: Record<string, string> = {
  financingWindowDays: "Payment window",
  financingGraceDays: "Grace period",
  financingFeeBps: "Financing fee",
  financingMaxEscrowCents: "Max per escrow",
  financingMaxOutstandingCents: "Max outstanding",
  financingMaxLapses: "Lapse limit",
};

function auditValue(v: unknown): string {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    const val = (v as Record<string, unknown>).value;
    return val === null || val === undefined ? "—" : String(val);
  }
  return "—";
}

function auditValueDisplay(key: string, v: unknown): string {
  const raw = auditValue(v);
  if (raw === "—") return raw;
  if (key === "financingMaxEscrowCents" || key === "financingMaxOutstandingCents") {
    const c = Number(raw);
    return Number.isFinite(c) ? `$${(c / 100).toLocaleString("en-US")}` : raw;
  }
  if (key === "financingFeeBps") {
    const bps = Number(raw);
    return Number.isFinite(bps) ? bpsToPct(bps) : raw;
  }
  return raw;
}

export default async function FinancingSettingsPage() {
  const demo = isDemoMode();
  const currentUser = await getCurrentUser();
  const role = demo ? await getDemoRole() : (currentUser?.role ?? null);

  if (!demo && role !== "ADMIN" && role !== "PLATFORM") {
    redirect("/dashboard");
  }

  const user = demo ? await getDemoUser() : currentUser;
  const actingUser = user ?? { name: null as string | null, email: "", role: "BUYER" as const };
  const isPlatform = demo ? role === "PLATFORM" : role === "ADMIN" || role === "PLATFORM";

  await ensurePlatformSettings();
  const settings = await getPlatformSettings();

  const settingAudit = await prisma.auditLog.findMany({
    where: { entityType: "PlatformSetting", action: "PLATFORM_SETTING_UPDATED", entityId: { startsWith: "financing" } },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { actor: { select: { name: true } } },
  });

  const totalDeadline = settings.financingWindowDays + settings.financingGraceDays;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-label text-plum-300">Platform operator</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
            Financing settings
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-cream-400">
            Terms for the deferred-payment (“Pay later”) option. Changes are audit-logged and hash-chained.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="btn-ghost">← Platform settings</Link>
          <span className="pill border-plum-500/60 bg-plum-500/15 text-plum-300">
            <span className="dot bg-plum-400" />
            acting as {actingUser.name ?? actingUser.email}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <TermCard label="Payment window" value={`${settings.financingWindowDays} days`} hint="to fund after choosing Pay later" />
        <TermCard
          label="Grace period"
          value={settings.financingGraceDays > 0 ? `${settings.financingGraceDays} days` : "None"}
          hint={settings.financingGraceDays > 0 ? `auto-cancel at window + ${settings.financingGraceDays}d` : "auto-cancel at the window"}
          accent={settings.financingGraceDays > 0 ? "text-hay-200" : "text-cream-100"}
        />
        <TermCard label="Financing fee" value={bpsToPct(settings.financingFeeBps)} hint="of sale, owed at funding" />
        <TermCard label="Max per escrow" value={`$${(settings.financingMaxEscrowCents / 100).toLocaleString("en-US")}`} hint="largest deal that can be financed" />
        <TermCard label="Max outstanding" value={`$${(settings.financingMaxOutstandingCents / 100).toLocaleString("en-US")}`} hint="concurrent financed amount per buyer" />
        <TermCard label="Lapse limit" value={String(settings.financingMaxLapses)} hint="missed deadlines in 90 days before financing is disabled" />
      </div>

      <section className="card card-pad">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-cream-50">Edit financing terms</h2>
          {isPlatform && <span className="pill border-hay-500/50 bg-hay-500/15 text-hay-200"><span className="dot bg-hay-300" />applies to new deals</span>}
        </div>
        <p className="mt-1 text-sm text-cream-400">
          Existing financed escrows keep the deadline they were created with; changes apply to new ones.
        </p>

        <form action={updatePlatformSettingsAction as unknown as (formData: FormData) => Promise<void>} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Payment window (days)">
              <input name="financingWindowDays" type="number" min="1" max="90" step="1" defaultValue={settings.financingWindowDays} disabled={!isPlatform} className="input" />
              <span className="mt-1 block text-[11px] text-cream-500">days a buyer has to fund before the deadline</span>
            </Field>
            <Field label="Grace period (days)">
              <input name="financingGraceDays" type="number" min="0" max="30" step="1" defaultValue={settings.financingGraceDays} disabled={!isPlatform} className="input" />
              <span className="mt-1 block text-[11px] text-cream-500">extra days after the window before auto-cancel (0 = none)</span>
            </Field>
            <Field label="Financing fee (bps)">
              <input name="financingFeeBps" type="number" min="0" max="1000" step="1" defaultValue={settings.financingFeeBps} disabled={!isPlatform} className="input" />
              <span className="mt-1 block text-[11px] text-cream-500">{bpsToPct(settings.financingFeeBps)} of sale, owed at funding</span>
            </Field>
            <Field label="Max per escrow ($)">
              <input name="financingMaxEscrowDollars" type="number" min="100" max="10000000" step="any" defaultValue={settings.financingMaxEscrowCents / 100} disabled={!isPlatform} className="input" />
              <span className="mt-1 block text-[11px] text-cream-500">largest deal that can be financed</span>
            </Field>
            <Field label="Max outstanding per buyer ($)">
              <input name="financingMaxOutstandingDollars" type="number" min="100" max="50000000" step="any" defaultValue={settings.financingMaxOutstandingCents / 100} disabled={!isPlatform} className="input" />
              <span className="mt-1 block text-[11px] text-cream-500">concurrent financed amount across open escrows</span>
            </Field>
            <Field label="Lapse limit">
              <input name="financingMaxLapses" type="number" min="1" max="10" step="1" defaultValue={settings.financingMaxLapses} disabled={!isPlatform} className="input" />
              <span className="mt-1 block text-[11px] text-cream-500">missed deadlines within 90 days before financing is disabled</span>
            </Field>
          </div>

          {isPlatform && (
            <button type="submit" className="btn-primary">Save financing terms</button>
          )}
        </form>

        {!isPlatform && (
          <p className="mt-4 rounded-lg border border-barn-500/40 bg-barn-500/10 px-3 py-2 text-xs text-barn-200">
            Viewing only — switch to the Platform role (or an admin account) to edit these terms.
          </p>
        )}
      </section>

      <section className="card card-pad">
        <h2 className="font-display text-lg font-semibold text-cream-50">How the deadline works</h2>
        <ol className="mt-4 space-y-3 text-sm text-cream-300">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-denim-500/20 font-mono text-xs font-bold text-denim-300">1</span>
            Buyer picks <span className="font-medium text-hay-200">Pay later</span> at checkout — the escrow is created awaiting payment with a {settings.financingWindowDays}-day window.
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-denim-500/20 font-mono text-xs font-bold text-denim-300">2</span>
            The payment deadline is stamped at <span className="font-medium text-cream-100">{totalDeadline} days</span> ({settings.financingWindowDays}-day window{settings.financingGraceDays > 0 ? ` + ${settings.financingGraceDays}-day grace` : ""}) and shown as a countdown on the escrow.
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-denim-500/20 font-mono text-xs font-bold text-denim-300">3</span>
            Funding posts the sale plus the {bpsToPct(settings.financingFeeBps)} fee to the ledger and the deal proceeds.
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-denim-500/20 font-mono text-xs font-bold text-denim-300">4</span>
            If the deadline passes unfunded, the escrow auto-cancels and the seller’s listing is released. {settings.financingMaxLapses} missed deadlines in 90 days disables financing for that buyer.
          </li>
        </ol>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-dirt-700/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-cream-50">Financing audit trail</h2>
          <p className="mt-0.5 text-sm text-cream-400">Every term change below is hash-chained into the append-only audit log.</p>
        </div>
        {settingAudit.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-cream-500">
            No financing term changes recorded yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Term</th>
                <th className="px-5 py-3.5 font-semibold">Before</th>
                <th className="px-5 py-3.5 font-semibold">After</th>
                <th className="px-5 py-3.5 font-semibold">Changed by</th>
                <th className="px-5 py-3.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {settingAudit.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="px-5 py-3.5 font-medium text-cream-100">{FINANCING_LABELS[row.entityId] ?? row.entityId}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-cream-400">{auditValueDisplay(row.entityId, row.before)}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-pasture-300">{auditValueDisplay(row.entityId, row.after)}</td>
                  <td className="px-5 py-3.5 text-cream-300">{row.actor?.name ?? row.actorRole ?? "—"}</td>
                  <td className="px-5 py-3.5 text-cream-500">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function TermCard({ label, value, hint, accent = "text-cream-100" }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-plum-400" aria-hidden />
      <p className="section-label">{label}</p>
      <p className={`stat-value ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-cream-500">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-cream-200">
      {label}
      {children}
    </label>
  );
}
