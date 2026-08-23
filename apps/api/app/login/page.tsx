import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthMethod } from "../../lib/auth";
import { LoginClient } from "./LoginClient";

export const metadata = { title: "Sign in - Livestock P2P" };

export default async function LoginPage() {
  const authMethod = getAuthMethod();

  if (authMethod === "demo") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-3xl font-bold text-cream-50">Demo Mode</h1>
        <p className="mt-4 text-cream-300">
          This instance runs in demo mode. Use the role switcher in the header to navigate between roles.
        </p>
        <Link href="/" className="mt-8 inline-block rounded-xl bg-barn-500 px-6 py-3 font-semibold text-on-color transition hover:bg-barn-400">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-block">
          <span className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-gradient-to-b from-barn-400 to-barn-600 text-on-color shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
              <path d="M4 11 12 4l8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 10.5V20h12v-9.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M10 20v-5h4v5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold text-cream-50">Welcome back</h1>
        <p className="mt-2 text-sm text-cream-400">
          {authMethod === "password" && "Sign in with your email and password"}
          {authMethod === "magic_link" && "Sign in with a one-time link sent to your email"}
          {authMethod === "oauth" && "Sign in with your preferred account"}
        </p>
      </div>
      <LoginClient authMethod={authMethod} />
    </div>
  );
}
