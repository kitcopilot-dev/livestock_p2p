"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "../actions/profile";

type Profile = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  businessName: string | null;
  dotNumber: string | null;
  einTaxId: string | null;
  role: string;
  kycStatus: string;
  image: string | null;
  stripeConnectedAccountId: string | null;
  dwollaCustomerId: string | null;
} | null;

type Props = { profile: Profile };

const ROLE_LABELS: Record<string, { emoji: string; label: string }> = {
  BUYER: { emoji: "\u{1F404}", label: "Buyer" },
  SELLER: { emoji: "\u{1F33E}", label: "Seller" },
  HAULER: { emoji: "\u{1F69B}", label: "Transporter" },
  PLATFORM: { emoji: "\u2699\uFE0F", label: "Platform" },
};

const KYC_COLORS: Record<string, string> = {
  APPROVED: "bg-pasture-500/20 text-pasture-300 border-pasture-500/30",
  PENDING: "bg-hay-500/20 text-hay-300 border-hay-500/30",
  NOT_STARTED: "bg-dirt-700 text-cream-400 border-dirt-600",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/30",
  EXPIRED: "bg-dirt-700 text-cream-400 border-dirt-600",
};

export function ProfileClient({ profile }: Props) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    businessName: profile?.businessName ?? "",
    dotNumber: profile?.dotNumber ?? "",
    einTaxId: profile?.einTaxId ?? "",
  });

  const update = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    startTransition(async () => {
      const res = await updateProfile(form);
      if ("error" in res) setError(res.error);
      else setSaved(true);
    });
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-cream-50">Profile not found</h1>
        <p className="mt-2 text-cream-400">No active user session.</p>
      </div>
    );
  }

  const roleInfo = ROLE_LABELS[profile.role] ?? { emoji: "?", label: profile.role };
  const isHauler = profile.role === "HAULER";
  const isSeller = profile.role === "SELLER";

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="font-display text-3xl font-bold text-cream-50">My Profile</h1>
      <p className="mt-1 text-sm text-cream-400">Manage your account information and payment connections.</p>

      {/* Identity card */}
      <div className="mt-6 rounded-2xl border border-dirt-600 bg-dirt-900/80 p-6 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-b from-barn-400 to-barn-600 text-3xl text-on-color shadow-lg">
            {roleInfo.emoji}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-cream-50">{profile.name ?? profile.email}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-dirt-700 px-2.5 py-0.5 text-xs font-medium text-cream-300">
                {roleInfo.label}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${KYC_COLORS[profile.kycStatus] ?? KYC_COLORS.NOT_STARTED}`}>
                KYC: {profile.kycStatus.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-dirt-800 px-4 py-3">
            <span className="text-cream-500">Email</span>
            <p className="mt-0.5 font-medium text-cream-100">{profile.email}</p>
          </div>
          <div className="rounded-xl bg-dirt-800 px-4 py-3">
            <span className="text-cream-500">Phone</span>
            <p className="mt-0.5 font-medium text-cream-100">{profile.phone ?? "\u2014"}</p>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSubmit} className="mt-6 rounded-2xl border border-dirt-600 bg-dirt-900/80 p-6 backdrop-blur">
        <h3 className="font-display text-lg font-bold text-cream-50">Personal Information</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Full name</label>
            <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)}
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="Your name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)}
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Business / farm name</label>
            <input type="text" value={form.businessName} onChange={(e) => update("businessName", e.target.value)}
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="Your business name" />
          </div>
          {isSeller && (
            <div>
              <label className="mb-1 block text-xs font-medium text-cream-400">EIN / Tax ID</label>
              <input type="text" value={form.einTaxId} onChange={(e) => update("einTaxId", e.target.value)}
                className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                placeholder="XX-XXXXXXX" />
            </div>
          )}
          {isHauler && (
            <div>
              <label className="mb-1 block text-xs font-medium text-cream-400">DOT Number</label>
              <input type="text" value={form.dotNumber} onChange={(e) => update("dotNumber", e.target.value)}
                className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
                placeholder="1234567" />
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        {saved && <p className="mt-4 text-sm text-pasture-400">Profile updated successfully.</p>}

        <div className="mt-6 flex justify-end">
          <button type="submit" disabled={pending}
            className="rounded-xl bg-barn-500 px-6 py-2.5 text-sm font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50">
            {pending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      {/* Payment rail info */}
      <div className="mt-6 rounded-2xl border border-dirt-600 bg-dirt-900/80 p-6 backdrop-blur">
        <h3 className="font-display text-lg font-bold text-cream-50">Payment Connections</h3>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-xl bg-dirt-800 px-4 py-3">
            <div>
              <span className="text-cream-400">Stripe</span>
              <p className="mt-0.5 text-xs text-cream-500">Connected account for payouts</p>
            </div>
            {profile.stripeConnectedAccountId ? (
              <span className="rounded-full bg-pasture-500/20 px-2.5 py-0.5 text-xs font-medium text-pasture-300 border border-pasture-500/30">
                Connected
              </span>
            ) : (
              <span className="rounded-full bg-dirt-700 px-2.5 py-0.5 text-xs font-medium text-cream-400 border border-dirt-600">
                Not connected
              </span>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-dirt-800 px-4 py-3">
            <div>
              <span className="text-cream-400">Dwolla</span>
              <p className="mt-0.5 text-xs text-cream-500">ACH payment rail</p>
            </div>
            {profile.dwollaCustomerId ? (
              <span className="rounded-full bg-pasture-500/20 px-2.5 py-0.5 text-xs font-medium text-pasture-300 border border-pasture-500/30">
                Connected
              </span>
            ) : (
              <span className="rounded-full bg-dirt-700 px-2.5 py-0.5 text-xs font-medium text-cream-400 border border-dirt-600">
                Not connected
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
