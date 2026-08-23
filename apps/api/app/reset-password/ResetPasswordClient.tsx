"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "../actions/auth";

export function ResetPasswordClient({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="rounded-2xl border border-pasture-500/30 bg-pasture-500/10 p-8 text-center">
        <div className="text-4xl">🔒</div>
        <h2 className="mt-4 font-display text-xl font-semibold text-cream-50">Password updated</h2>
        <p className="mt-2 text-sm text-cream-300">Your password has been changed. You can now sign in with the new one.</p>
        <Link href="/login" className="mt-6 inline-block rounded-xl bg-barn-500 px-6 py-3 font-semibold text-on-color transition hover:bg-barn-400">
          Sign in
        </Link>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    startTransition(async () => {
      const res = await resetPassword(token, password);
      if ("error" in res) setError(res.error);
      else setDone(true);
    });
  }

  return (
    <div className="rounded-2xl border border-dirt-600 bg-dirt-900/80 p-8 shadow-xl backdrop-blur">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-400">New password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
            className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none focus:ring-1 focus:ring-barn-400"
            placeholder="At least 8 characters" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-400">Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password"
            className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none focus:ring-1 focus:ring-barn-400"
            placeholder="Repeat your new password" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={pending}
          className="w-full rounded-xl bg-barn-500 py-3 font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50">
          {pending ? "Updating..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}
