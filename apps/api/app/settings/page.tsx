import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { isDemoSpeedMode } from "@livestock/shared";
import { getDemoRole, getDemoUser } from "../../lib/demoAuth";
import { getCurrentUser, isDemoMode } from "../../lib/auth";
import { ensurePlatformSettings, getPlatformSettings } from "../../lib/platformSettings";
import { updatePlatformSettingsAction, getRailStatuses, onboardTestUsersAction } from "../actions/settings";
import { formatDate, bpsToPct, msToHours } from "../../lib/format";
import { redirect } from "next/navigation";
import type { UserRole } from "@livestock/db";

export const dynamic = "force-dynamic";

const SETTING_LABELS: Record<string, string> = {
  platformFeeBps: "Platform fee (bps)",
  weightTolerancePct: "Weight tolerance (%)",
  freightFeePct: "Freight estimate (%)",
  paymentRail: "Payout rail",
  inspectionWindowMs: "Inspection window",
  disputeProofWindowMs: "Dispute proof window",
  financingWindowDays: "Financing window (days)",
  financingGraceDays: "Financing grace (days)",
  financingFeeBps: "Financing fee (bps)",
  financingMaxEscrowCents: "Financing cap per escrow",
  financingMaxOutstandingCents: "Financing outstanding cap",
  financingMaxLapses: "Financing lapse limit",
};

/** Extract the stored `value` from an audit before/after JSON blob. */
function auditValue(v: unknown): string {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    const val = (v as Record<string, unknown>).value;
    return val === null || val === undefined ? "—" : String(val);
  }
  return "—";
}

/** Audit value with window keys shown in hours instead of raw ms. */
function auditValueDisplay(key: string, v: unknown): string {
  const raw = auditValue(v);
  if (raw === "—") return raw;
  if (key === "inspectionWindowMs" || key === "disputeProofWindowMs") {
    const ms = Number(raw);
    return Number.isFinite(ms) ? msToHours(ms) : raw;
  }
  if (key === "financingMaxEscrowCents" || key === "financingMaxOutstandingCents") {
    const c = Number(raw);
    return Number.isFinite(c) ? `$${(c / 100).toLocaleString("en-US")}` : raw;
  }
  return raw;
}

export default async function SettingsPage() {
  const demo = isDemoMode();
  const currentUser = await getCurrentUser();
  const role = demo ? await getDemoRole() : (currentUser?.role ?? null);

  // Real-auth mode: only ADMIN / PLATFORM may reach the settings surface.
  if (!demo && role !== "ADMIN" && role !== "PLATFORM") {
    redirect("/dashboard");
  }

  const user = demo ? await getDemoUser() : currentUser;
  const actingUser = user ?? { name: null as string | null, email: "", role: "BUYER" as UserRole };
  const isPlatform = demo ? role === "PLATFORM" : role === "ADMIN" || role === "PLATFORM";

  await ensurePlatformSettings();
  const settings = await getPlatformSettings();

  const [auditBroken, ledgerSummary, settingAudit] = await Promise.all([
    auditLogger.verifyChain(10_000),
    prisma.ledgerEntry.aggregate({ _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.auditLog.findMany({
      where: { entityType: "PlatformSetting", action: "PLATFORM_SETTING_UPDATED" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const standaloneFreight = process.env.FEATURE_STANDALONE_FREIGHT === "true";
  const demoSpeedCookie = (await cookies()).get("demo_speed")?.value ?? "normal";
  const envOverride = isDemoSpeedMode();
  const demoSpeed = demoSpeedCookie !== "normal" || envOverride;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-label text-plum-300">Platform operator</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-cream-50 sm:text-3xl">
            Platform settings
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-cream-400">
            Escrow economics, payout rails, and compliance posture. Changes are audit-logged and
            hash-chained for the Packers &amp; Stockyards record.
          </p>
        </div>
        <span className="pill border-plum-500/60 bg-plum-500/15 text-plum-300">
          <span className="dot bg-plum-400" />
          acting as {actingUser.name ?? actingUser.email}
        </span>
      </div>

      {!isPlatform && (
        <div className="card card-pad border-barn-500/40">
          <p className="font-semibold text-cream-100">Operator access only</p>
          <p className="mt-1 text-sm text-cream-400">
            You are viewing as {actingUser.name ?? actingUser.email}. Switch to the <span className="font-medium text-plum-300">Platform</span> role
            in the header to edit these settings.
          </p>
        </div>
      )}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatusCard
          label="Audit chain"
          value={auditBroken.length === 0 ? "Intact" : `${auditBroken.length} broken`}
          tone={auditBroken.length === 0 ? "pasture" : "barn"}
          hint="append-only, hash-chained"
        />
        <StatusCard label="Webhook signing" value="HMAC enforced" tone="pasture" hint="Stripe + Dwolla + partners" />
        <StatusCard label="Ledger rows" value={ledgerSummary._count._all.toLocaleString()} tone="denim" hint="zero-sum via DB triggers" />
        <StatusCard
          label="Demo speed"
          value={demoSpeed ? "Accelerated" : "Normal"}
          tone={demoSpeed ? "hay" : "denim"}
          hint="24h / 48h windows"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card card-pad lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-cream-50">Escrow economics</h2>
            <span className="pill border-hay-500/50 bg-hay-500/15 text-hay-200">
              <span className="dot bg-hay-300" />
              defaults for new deals
            </span>
          </div>
          <p className="mt-1 text-sm text-cream-400">
            These values seed every new escrow draft. Existing escrows are immutable and keep the
            values they were created with.
          </p>

          <form action={updatePlatformSettingsAction as unknown as (formData: FormData) => Promise<void>} className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Field label="Platform fee (bps)">
                <input name="platformFeeBps" type="number" min="0" max="10000" defaultValue={settings.platformFeeBps} disabled={!isPlatform} className="input" />
                <span className="mt-1 block text-[11px] text-cream-500">{bpsToPct(settings.platformFeeBps)} of sale</span>
              </Field>
              <Field label="Weight tolerance (%)">
                <input name="weightTolerancePct" type="number" min="0" max="50" defaultValue={settings.weightTolerancePct} disabled={!isPlatform} className="input" />
                <span className="mt-1 block text-[11px] text-cream-500">±{settings.weightTolerancePct}% before shrink penalty</span>
              </Field>
              <Field label="Freight estimate (%)">
                <input name="freightFeePct" type="number" min="0" max="100" defaultValue={settings.freightFeePct} disabled={!isPlatform} className="input" />
                <span className="mt-1 block text-[11px] text-cream-500">of sale when a listing becomes a load</span>
              </Field>
            </div>

            <Field label="Payout rail">
              <select name="paymentRail" defaultValue={settings.paymentRail} disabled={!isPlatform} className="input">
                <option value="STRIPE" className="bg-dirt-900">Stripe Connect</option>
                <option value="DWOLLA" className="bg-dirt-900">Dwolla ACH</option>
              </select>
              <span className="mt-1 block text-[11px] text-cream-500">
                Default destination rail for settlement transfers; per-deal overrides still apply.
              </span>
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Inspection window (hours)">
                {/* step=any: min is fractional (0.02h) so a fixed step like 1 would
                    make valid defaults (24/48) fail native constraint validation
                    and silently block form submission. */}
                <input name="inspectionWindowHours" type="number" min="0.02" max="720" step="any"
                  defaultValue={settings.inspectionWindowMs / 3_600_000} disabled={!isPlatform} className="input" />
                <span className="mt-1 block text-[11px] text-cream-500">after delivery, before auto-release</span>
              </Field>
              <Field label="Dispute proof window (hours)">
                <input name="disputeProofWindowHours" type="number" min="0.02" max="720" step="any"
                  defaultValue={settings.disputeProofWindowMs / 3_600_000} disabled={!isPlatform} className="input" />
                <span className="mt-1 block text-[11px] text-cream-500">evidence submission after a dispute</span>
              </Field>
            </div>

            {isPlatform && (
              <button type="submit" className="btn-primary">Save settings</button>
            )}
          </form>
        </section>

        <section className="card card-pad">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-cream-50">Financing terms</h2>
            <Link href="/settings/financing" className="text-sm font-medium text-plum-300 hover:text-plum-200">
              Manage →
            </Link>
          </div>
          <p className="mt-1 text-sm text-cream-400">Deferred-payment (“Pay later”) economics.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <FinRow label="Payment window" value={`${settings.financingWindowDays} days`} />
            <FinRow label="Grace period" value={settings.financingGraceDays > 0 ? `${settings.financingGraceDays} days` : "None"} />
            <FinRow label="Financing fee" value={bpsToPct(settings.financingFeeBps)} />
            <FinRow label="Max per escrow" value={`$${(settings.financingMaxEscrowCents / 100).toLocaleString("en-US")}`} />
            <FinRow label="Max outstanding" value={`$${(settings.financingMaxOutstandingCents / 100).toLocaleString("en-US")}`} />
            <FinRow label="Lapse limit" value={String(settings.financingMaxLapses)} />
          </dl>
        </section>

        <section className="card card-pad">
          <h2 className="font-display text-lg font-semibold text-cream-50">Time-locked windows</h2>
          <p className="mt-1 text-sm text-cream-400">Effective values — editable in the economics form above.</p>
          <dl className="mt-4 space-y-4 text-sm">
            <WindowRow label="Buyer inspection" value={msToHours(settings.inspectionWindowMs)} hint="after delivery, before auto-release" />
            <WindowRow label="Dispute proof" value={msToHours(settings.disputeProofWindowMs)} hint="evidence submission after a dispute" />
            <WindowRow label="Scheduler" value="BullMQ" hint="survives restarts & partitions" tone="pasture" />
          </dl>
          {demoSpeed && (
            <p className="mt-4 rounded-lg border border-hay-500/40 bg-hay-500/10 px-3 py-2 text-xs text-hay-200">
              ⏱ Demo speed is active — the header Speed control is overriding these windows so the
              workers fire live in the preview.
            </p>
          )}
        </section>
      </div>

      <section className="card card-pad">
        <h2 className="font-display text-lg font-semibold text-cream-50">Feature flags &amp; environment</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FlagRow
            label="Standalone freight posting"
            on={standaloneFreight}
            detail="FEATURE_STANDALONE_FREIGHT env — flips the post-a-load flow without a deploy."
          />
          <FlagRow
            label="Demo speed windows (env)"
            on={envOverride}
            detail="DEMO_INSPECTION_WINDOW_MS / DEMO_DISPUTE_PROOF_WINDOW_MS env overrides."
          />
        </div>
        <p className="mt-4 text-xs text-cream-500">
          Secrets and rail credentials are never stored here — they live in environment variables
          and are verified at request time (HMAC webhook signatures, constant-time comparison).
        </p>
      </section>

      {/* Setting audit trail */}
      <section className="card overflow-hidden">
        <div className="border-b border-dirt-700/70 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-cream-50">Setting audit trail</h2>
          <p className="mt-0.5 text-sm text-cream-400">
            Every change below is hash-chained into the append-only audit log.
          </p>
        </div>
        {settingAudit.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-cream-500">
            No setting changes recorded yet — the audit trail appears the first time a value is saved.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Setting</th>
                <th className="px-5 py-3.5 font-semibold">Before</th>
                <th className="px-5 py-3.5 font-semibold">After</th>
                <th className="px-5 py-3.5 font-semibold">Changed by</th>
                <th className="px-5 py-3.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {settingAudit.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-dirt-800/40">
                  <td className="px-5 py-3.5 font-medium text-cream-100">
                    {SETTING_LABELS[row.entityId] ?? row.entityId}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-cream-400">
                    {auditValueDisplay(row.entityId, row.before)}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-pasture-300">
                    {auditValueDisplay(row.entityId, row.after)}
                  </td>
                  <td className="px-5 py-3.5 text-cream-300">{row.actor?.name ?? row.actorRole ?? "—"}</td>
                  <td className="px-5 py-3.5 text-cream-500">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Payment rail provisioning */}
      <RailProvisioningSection isPlatform={isPlatform} />
    </div>
  );
}


function RailProvisioningSection({ isPlatform }: { isPlatform: boolean }) {
  return (
    <section className="card card-pad">
      <h2 className="font-display text-lg font-semibold text-cream-50">Payment rail provisioning</h2>
      <p className="mt-1 text-sm text-cream-400">
        Onboard the test users (buyer / seller / hauler) on the active payment rail so escrow
        funding and settlement can run against real sandbox accounts.
      </p>
      <RailStatusTable />
      {isPlatform && (
        <form action={onboardTestUsersAction as unknown as (formData: FormData) => Promise<void>} className="mt-4">
          <input type="hidden" name="rail" value="" />
          <button type="submit" className="btn-primary">
            Onboard test users on active rail
          </button>
        </form>
      )}
    </section>
  );
}

async function RailStatusTable() {
  const statuses = await getRailStatuses();
  const setting = await prisma.platformSetting.findUnique({ where: { key: "paymentRail" } });
  const rail = setting?.value ?? "STRIPE";
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-cream-500">
        Active rail: <span className="font-medium text-cream-200">{rail}</span>
      </p>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Role</th>
            <th className="px-4 py-2.5 font-semibold">Email</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 font-semibold">Rail ref</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dirt-700/50">
          {statuses.map((s) => (
            <tr key={s.role} className="transition-colors hover:bg-dirt-800/40">
              <td className="px-4 py-2.5 font-medium text-cream-100 uppercase">{s.role}</td>
              <td className="px-4 py-2.5 text-cream-400">{s.email}</td>
              <td className="px-4 py-2.5">
                <span className={`pill ${s.railReady ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : "border-dirt-600 bg-dirt-800 text-cream-400"}`}>
                  <span className={`dot ${s.railReady ? "bg-pasture-400" : "bg-cream-500"}`} />
                  {s.railReady ? "ready" : "not onboarded"}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-cream-500">
                {s.walletRef ? `${s.walletRef.slice(0, 40)}${s.walletRef.length > 40 ? "…" : ""}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function StatusCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "pasture" | "barn" | "denim" | "hay";
}) {
  const tones: Record<string, string> = {
    pasture: "bg-pasture-400",
    barn: "bg-barn-400",
    denim: "bg-denim-400",
    hay: "bg-hay-400",
  };
  const accents: Record<string, string> = {
    pasture: "text-pasture-300",
    barn: "text-barn-200",
    denim: "text-denim-300",
    hay: "text-hay-200",
  };
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${tones[tone]}`} aria-hidden />
      <p className="section-label">{label}</p>
      <p className={`stat-value ${accents[tone]}`}>{value}</p>
      <p className="mt-1 text-[11px] text-cream-500">{hint}</p>
    </div>
  );
}

function FinRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dirt-700/50 pb-2.5 last:border-0 last:pb-0">
      <dt className="font-medium text-cream-100">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-plum-200">{value}</dd>
    </div>
  );
}

function WindowRow({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "pasture";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dirt-700/50 pb-3 last:border-0 last:pb-0">
      <div>
        <dt className="font-medium text-cream-100">{label}</dt>
        <dd className="text-[11px] text-cream-500">{hint}</dd>
      </div>
      <dd className={`text-lg font-semibold tabular-nums ${tone === "pasture" ? "text-pasture-300" : "text-cream-100"}`}>
        {value}
      </dd>
    </div>
  );
}

function FlagRow({ label, on, detail }: { label: string; on: boolean; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dirt-700/70 bg-dirt-900/50 px-4 py-3">
      <span className={`pill ${on ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200" : "border-dirt-600 bg-dirt-800 text-cream-400"}`}>
        <span className={`dot ${on ? "bg-pasture-400" : "bg-cream-500"}`} />
        {on ? "on" : "off"}
      </span>
      <div>
        <p className="font-medium text-cream-100">{label}</p>
        <p className="text-xs text-cream-500">{detail}</p>
      </div>
    </div>
  );
}
