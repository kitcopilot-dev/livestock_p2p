import { NextResponse } from "next/server";
import { prisma } from "@livestock/db";
import { getCurrentUser } from "../../../../lib/auth";

/**
 * Stripe Connect onboarding callback. After the user completes (or exits)
 * Stripe's hosted onboarding, they land here. We check the account status
 * and redirect to the profile with a success/pending indicator.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const baseUrl = process.env.NEXTAUTH_URL || "https://livestock-p2p.exe.xyz";
  const profileUrl = new URL("/profile", baseUrl);

  try {
    const user = await getCurrentUser();
    if (!user) {
      profileUrl.searchParams.set("stripe", "error");
      profileUrl.searchParams.set("msg", "not_authenticated");
      return NextResponse.redirect(profileUrl);
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.stripeConnectedAccountId) {
      profileUrl.searchParams.set("stripe", "error");
      profileUrl.searchParams.set("msg", "no_account");
      return NextResponse.redirect(profileUrl);
    }

    // The account exists — redirect with success. The profile page will
    // poll getStripeStatus() to show the current onboarding state.
    profileUrl.searchParams.set("stripe", "connected");
    return NextResponse.redirect(profileUrl);
  } catch (err) {
    console.error("[stripe-callback] error:", err);
    profileUrl.searchParams.set("stripe", "error");
    return NextResponse.redirect(profileUrl);
  }
}
