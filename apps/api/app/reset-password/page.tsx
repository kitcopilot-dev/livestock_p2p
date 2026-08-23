import Link from "next/link";
import { getAuthMethod } from "../../lib/auth";
import { ResetPasswordClient } from "./ResetPasswordClient";

export const metadata = { title: "Reset password - Livestock P2P" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const authMethod = getAuthMethod();
  const { token } = await searchParams;

  if (authMethod !== "password" || !token) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-3xl font-bold text-cream-50">Invalid reset link</h1>
        <p className="mt-4 text-cream-300">
          This password reset link is missing or this instance doesn&apos;t support password sign-in.
          Request a new link from the sign-in page.
        </p>
        <Link href="/login" className="mt-8 inline-block rounded-xl bg-barn-500 px-6 py-3 font-semibold text-on-color transition hover:bg-barn-400">
          Go to Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-block">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-barn-400 to-barn-600 text-on-color shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
              <path d="M4 11 12 4l8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 10.5V20h12v-9.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M10 20v-5h4v5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold text-cream-50">Set a new password</h1>
        <p className="mt-2 text-sm text-cream-400">Choose a new password for your account.</p>
      </div>
      <ResetPasswordClient token={token} />
    </div>
  );
}
