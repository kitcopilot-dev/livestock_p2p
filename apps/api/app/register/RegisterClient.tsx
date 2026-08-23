"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { registerWithEmail, requestMagicLink } from "../actions/auth";
import type { UserRole } from "@livestock/db";

type Props = { authMethod: string };

const ROLES: Array<{ value: UserRole; label: string; emoji: string }> = [
  { value: "BUYER", label: "Buyer", emoji: "\u{1F404}" },
  { value: "SELLER", label: "Seller", emoji: "\u{1F33E}" },
  { value: "HAULER", label: "Transporter", emoji: "\u{1F69B}" },
];

export function RegisterClient({ authMethod }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("BUYER");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="rounded-2xl border border-pasture-500/30 bg-pasture-500/10 p-8 text-center">
        <div className="text-4xl">{"\u{1F4E7}"}</div>
        <h2 className="mt-4 font-display text-xl font-semibold text-cream-50">Check your email</h2>
        <p className="mt-2 text-sm text-cream-300">
          We sent a sign-in link to <span className="font-medium text-cream-100">{email}</span>.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-barn-400 hover:text-barn-300">Back to sign in</Link>
      </div>
    );
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    const res = await registerWithEmail(email, password, name, role);
    if ("error" in res) setError(res.error);
  }

  function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await requestMagicLink(email, role);
      if ("error" in res) setError(res.error);
      else setSent(true);
    });
  }

  async function handleOAuth() {
    await signIn("google", { callbackUrl: "/onboarding" });
  }

  return (
    <div className="rounded-2xl border border-dirt-600 bg-dirt-900/80 p-8 shadow-xl backdrop-blur">
      <div className="mb-6">
        <label className="mb-2 block text-xs font-medium text-cream-400">I want to...</label>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button key={r.value} type="button" onClick={() => setRole(r.value)}
              className={`rounded-xl border p-3 text-center transition ${role === r.value ? "border-barn-400 bg-barn-500/20 text-cream-50" : "border-dirt-600 bg-dirt-800 text-cream-300 hover:border-dirt-500"}`}>
              <span className="text-2xl">{r.emoji}</span>
              <span className="mt-1 block text-xs font-semibold">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {authMethod === "password" && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name"
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="John Smith" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="At least 8 characters" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="w-full rounded-xl bg-barn-500 py-3 font-semibold text-on-color transition hover:bg-barn-400">Create account</button>
        </form>
      )}

      {authMethod === "magic_link" && (
        <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none"
              placeholder="you@example.com" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={pending}
            className="w-full rounded-xl bg-barn-500 py-3 font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50">
            {pending ? "Sending..." : "Send sign-up link"}
          </button>
        </form>
      )}

      {authMethod === "oauth" && (
        <div className="space-y-3">
          <p className="text-center text-xs text-cream-400">
            Your Google account will be linked as a <span className="font-medium text-cream-200">{role.toLowerCase()}</span>.
          </p>
          <button onClick={handleOAuth}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-dirt-500 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-50">
            Sign up with Google
          </button>
        </div>
      )}

      <div className="mt-6 text-center text-xs text-cream-500">
        Already have an account? <Link href="/login" className="text-barn-400 hover:text-barn-300">Sign in</Link>
      </div>
    </div>
  );
}
