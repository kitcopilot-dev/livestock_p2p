"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

type Props = { token: string; redirectTo: string };

export function VerifyClient({ token, redirectTo }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    signIn("credentials", { token, redirect: false }).then((result) => {
      if (result?.error) {
        setError("Sign-in failed. The link may have expired.");
      } else {
        router.push(redirectTo);
      }
    });
  }, [token, redirectTo, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-cream-50">Sign-in failed</h1>
        <p className="mt-2 text-cream-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="text-4xl">⏳</div>
      <h1 className="mt-4 font-display text-2xl font-bold text-cream-50">Signing you in...</h1>
      <p className="mt-2 text-cream-400">Please wait while we complete your sign-in.</p>
    </div>
  );
}
