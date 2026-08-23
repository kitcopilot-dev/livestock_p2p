import Link from "next/link";
import { verifyMagicLinkToken } from "../../../actions/auth";
import { VerifyClient } from "./VerifyClient";

type Props = { params: Promise<{ token: string }> };

export default async function VerifyPage({ params }: Props) {
  const { token } = await params;
  const result = await verifyMagicLinkToken(token);

  if ("error" in result) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-cream-50">Link invalid</h1>
        <p className="mt-2 text-cream-400">{result.error}</p>
        <Link href="/login" className="mt-8 inline-block rounded-xl bg-barn-500 px-6 py-3 font-semibold text-on-color transition hover:bg-barn-400">
          Back to sign in
        </Link>
      </div>
    );
  }

  // Token validated — hand off to client component to call signIn()
  return <VerifyClient token={token} redirectTo={result.redirect} />;
}
