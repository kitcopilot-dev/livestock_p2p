"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "../actions/auth";
import type { UserRole } from "@livestock/db";

const STEPS = ["Account", "Your role", "Review"] as const;

const ROLE_INFO: Record<string, { emoji: string; label: string }> = {
  BUYER: { emoji: "\u{1F404}", label: "Buyer" },
  SELLER: { emoji: "\u{1F33E}", label: "Seller" },
  HAULER: { emoji: "\u{1F69B}", label: "Transporter" },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [role, setRole] = useState<UserRole>("BUYER");
  const [form, setForm] = useState({ name: "", phone: "", businessName: "", dotNumber: "", einTaxId: "" });

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      const res = await completeOnboarding(form);
      if ("error" in res) setError(res.error);
      else router.push("/");
    });
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${i < step ? "bg-pasture-500 text-on-color" : i === step ? "bg-barn-500 text-on-color" : "bg-dirt-700 text-cream-400"}`}>
              {i < step ? "\u2713" : String(i + 1)}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-12 ${i < step ? "bg-pasture-500" : "bg-dirt-700"}`} />}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dirt-600 bg-dirt-900/80 p-8 shadow-xl backdrop-blur">
        <h2 className="font-display text-xl font-bold text-cream-50">{STEPS[step]}</h2>

        {step === 0 && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-cream-400">Full name</label>
              <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                placeholder="John Smith" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-cream-400">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)}
                className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                placeholder="(555) 123-4567" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {(["BUYER", "SELLER", "HAULER"] as UserRole[]).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  className={`rounded-xl border p-4 text-center transition ${role === r ? "border-barn-400 bg-barn-500/20 text-cream-50" : "border-dirt-600 bg-dirt-800 text-cream-300 hover:border-dirt-500"}`}>
                  <span className="text-3xl">{ROLE_INFO[r].emoji}</span>
                  <span className="mt-1 block text-xs font-semibold">{ROLE_INFO[r].label}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-cream-400">Business / farm name</label>
              <input type="text" value={form.businessName} onChange={(e) => update("businessName", e.target.value)}
                className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                placeholder="Sunset Ranch LLC" />
            </div>
            {role === "SELLER" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-cream-400">EIN / Tax ID</label>
                <input type="text" value={form.einTaxId} onChange={(e) => update("einTaxId", e.target.value)}
                  className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                  placeholder="XX-XXXXXXX" />
              </div>
            )}
            {role === "HAULER" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-cream-400">DOT Number</label>
                <input type="text" value={form.dotNumber} onChange={(e) => update("dotNumber", e.target.value)}
                  className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                  placeholder="1234567" />
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between rounded-xl bg-dirt-800 px-4 py-3">
              <span className="text-cream-400">Name</span>
              <span className="font-medium text-cream-100">{form.name || "\u2014"}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-dirt-800 px-4 py-3">
              <span className="text-cream-400">Phone</span>
              <span className="font-medium text-cream-100">{form.phone || "\u2014"}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-dirt-800 px-4 py-3">
              <span className="text-cream-400">Role</span>
              <span className="font-medium text-cream-100">{ROLE_INFO[role].emoji} {ROLE_INFO[role].label}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-dirt-800 px-4 py-3">
              <span className="text-cream-400">Business</span>
              <span className="font-medium text-cream-100">{form.businessName || "\u2014"}</span>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)}
              className="rounded-xl border border-dirt-600 px-5 py-2.5 text-sm text-cream-300 transition hover:bg-dirt-800">Back</button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)}
              className="rounded-xl bg-barn-500 px-6 py-2.5 text-sm font-semibold text-on-color transition hover:bg-barn-400">Continue</button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={pending}
              className="rounded-xl bg-pasture-500 px-6 py-2.5 text-sm font-semibold text-on-color transition hover:bg-pasture-400 disabled:opacity-50">
              {pending ? "Setting up..." : "Complete registration"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
