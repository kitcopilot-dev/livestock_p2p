"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { finishPasswordLogin, requestMagicLink } from "../actions/auth";

type Props = { authMethod: string };

export function LoginClient({ authMethod }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="rounded-2xl border border-pasture-500/30 bg-pasture-500/10 p-8 text-center">
        <div className="text-4xl">📧</div>
        <h2 className="mt-4 font-display text-xl font-semibold text-cream-50">Check your email</h2>
        <p className="mt-2 text-sm text-cream-300">
          We sent a sign-in link to <span className="font-medium text-cream-100">{email}</span>.
          The link expires in 15 minutes.
        </p>
      </div>
    );
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    const { redirect } = await finishPasswordLogin();
    window.location.href = redirect;
  }

  function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await requestMagicLink(email);
      if ("error" in res) setError(res.error);
      else setSent(true);
    });
  }

  async function handleOAuth(provider: string) {
    await signIn(provider, { callbackUrl: "/onboarding" });
  }

  return (
    <div className="rounded-2xl border border-dirt-600 bg-dirt-900/80 p-8 shadow-xl backdrop-blur">
      {authMethod === "password" && (
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none focus:ring-1 focus:ring-barn-400"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none focus:ring-1 focus:ring-barn-400"
              placeholder={"\u2022".repeat(8)} />
          </div>
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-barn-400 hover:text-barn-300">Forgot password?</Link>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="w-full rounded-xl bg-barn-500 py-3 font-semibold text-on-color transition hover:bg-barn-400">Sign in</button>
        </form>
      )}
      {authMethod === "magic_link" && (
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-cream-400">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-xl border border-dirt-600 bg-dirt-800 px-4 py-3 text-sm text-cream-50 placeholder:text-cream-500 focus:border-barn-400 focus:outline-none focus:ring-1 focus:ring-barn-400"
              placeholder="you@example.com" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={pending} className="w-full rounded-xl bg-barn-500 py-3 font-semibold text-on-color transition hover:bg-barn-400 disabled:opacity-50">
            {pending ? "Sending..." : "Send me a login link"}
          </button>
        </form>
      )}
      {authMethod === "oauth" && (
        <div className="space-y-3">
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={() => handleOAuth("google")} className="flex w-full items-center justify-center gap-3 rounded-xl border border-dirt-500 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition hover:bg-gray-50">
            Continue with Google
          </button>
        </div>
      )}
      <div className="mt-6 text-center text-xs text-cream-500">
        <p>New here? <Link href="/register" className="text-barn-400 hover:text-barn-300">Create an account</Link></p>
      </div>
    </div>
  );
}
