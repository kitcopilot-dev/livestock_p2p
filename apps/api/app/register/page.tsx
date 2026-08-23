import Link from "next/link";
import { getAuthMethod } from "../../lib/auth";
import { RegisterClient } from "./RegisterClient";

export const metadata = { title: "Create account - Livestock P2P" };

export default async function RegisterPage() {
  const authMethod = getAuthMethod();
  if (authMethod === "demo") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-3xl font-bold text-cream-50">Demo Mode</h1>
        <p className="mt-4 text-cream-300">Registration is available in password, magic_link, or oauth mode.</p>
        <Link href="/" className="mt-8 inline-block rounded-xl bg-barn-500 px-6 py-3 font-semibold text-on-color transition hover:bg-barn-400">Go to Dashboard</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md py-16">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold text-cream-50">Create your account</h1>
        <p className="mt-2 text-sm text-cream-400">Choose a role to get started</p>
      </div>
      <RegisterClient authMethod={authMethod} />
    </div>
  );
}
