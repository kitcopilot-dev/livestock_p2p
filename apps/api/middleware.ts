import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route protection middleware.
 * - AUTH_METHOD=demo → no-op (bypass, current behavior preserved)
 * - Otherwise: unauthenticated → /login, incomplete onboarding → /onboarding
 */
export function middleware(request: NextRequest) {
  const authMethod = process.env.AUTH_METHOD ?? "demo";

  // Demo mode: no middleware protection
  if (authMethod === "demo") return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Public routes — always accessible
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/marketplace") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check for session cookie (NextAuth v5 uses `authjs.session-token` or
  // `__Secure-authjs.session-token` in production)
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check onboarding status via a custom cookie set by the verify flow
  // (the session JWT doesn't have onboarding status without a DB read,
  // so we use a lightweight flag cookie)
  const onboarded = request.cookies.get("onboarded")?.value;
  if (!onboarded && !pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static files)
     * - favicon.ico (browser icon)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
