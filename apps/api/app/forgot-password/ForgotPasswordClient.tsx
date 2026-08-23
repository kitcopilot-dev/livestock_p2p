"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestPasswordReset } from "../actions/auth";

export function ForgotPasswordClient() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="rounded-2xl border border-pasture-500/30 bg-pasture-500/10 p-8 text-center">
        <div className="text-4xl">📧</div>
        <h2 className="mt-4 font-display text-xl font-semibold text-cream-50">Check your email</h2>
        <p className="mt-2 text-sm text-cream-300">
          If an account exists for <span className="font-medium text-cream-100">{email}</span>, we&apos;ve sent a
          link to reset your password. The link expires in 1 hour.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm text-barn-400 hover:text-barn-300">Back to sign in</Link>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await requestPasswordReset(email);
      if ("error" in res) setError(res.error);
      else setSent(true);
    });
  }

  return (
    <div className="rounded-2xl border border-dirt-600 bg-dirt-900/80 p-8 shadow-xl backdrop-blur">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-400">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
            className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none focus:ring-1 focus:ring-barn-400"
            placeholder="you@example.com" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={pending}
          className="w-full rounded-xl bg-barn-500 py-3 font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50">
          {pending ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-cream-500">
        <p>Remembered it? <Link href="/login" className="text-barn-400 hover:text-barn-300">Back to sign in</Link></p>
      </div>
    </div>
  );
}
