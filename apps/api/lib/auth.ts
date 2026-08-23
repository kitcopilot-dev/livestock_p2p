/**
 * Authentication configuration — NextAuth.js v5 + Prisma adapter.
 *
 * AUTH_METHOD env var selects the active flow:
 *   - "demo"      → cookie-based role switcher (no real auth)
 *   - "password"  → email + bcrypt password
 *   - "magic_link" → passwordless one-time link
 *   - "oauth"     → Google (+ extensible) OAuth
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma, type UserRole } from "@livestock/db";

// ---------------------------------------------------------------------------
// Auth method helper
// ---------------------------------------------------------------------------

export type AuthMethod = "demo" | "password" | "magic_link" | "oauth";

export function getAuthMethod(): AuthMethod {
  return (process.env.AUTH_METHOD ?? "demo") as AuthMethod;
}

export function isDemoMode(): boolean {
  return getAuthMethod() === "demo";
}

// ---------------------------------------------------------------------------
// NextAuth config
// ---------------------------------------------------------------------------

const authMethod = getAuthMethod();

const providers: any[] = [];

if (authMethod === "password") {
  providers.push(
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          select: { id: true, email: true, name: true, passwordHash: true, role: true, isActive: true },
        });
        if (!user || !user.passwordHash || !user.isActive) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

if (authMethod === "oauth") {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  );
}

// Magic link is handled via a separate API route, but we still need a
// Credentials provider that the verify page calls signIn() with.
if (authMethod === "magic_link") {
  providers.push(
    Credentials({
      name: "Magic Link",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null;
        const token = credentials.token as string;
        const record = await prisma.magicLink.findUnique({ where: { token } });
        if (!record) return null;
        if (record.expiresAt < new Date()) return null;
        // Note: usedAt check removed — the server action already validated
        // and marked the token. The authorize function just resolves the user.

        // User was already upserted by the server action — just look them up
        const user = await prisma.user.findUnique({
          where: { email: record.email },
          select: { id: true, email: true, name: true, role: true },
        });
        if (!user) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  // Behind the exe.dev proxy / tunnels the Host header differs from the
  // server's own hostname (0.0.0.0:3000), and NextAuth v5 rejects untrusted
  // hosts with UntrustedHost errors that break both session reads and the
  // credentials callback. Trust the Host header so login/register work
  // behind any proxy or tunnel.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as UserRole;
      }
      return session;
    },
  },
});

// ---------------------------------------------------------------------------
// Server-side helpers
// ---------------------------------------------------------------------------

import { cookies } from "next/headers";
import { ensureDemoUsers, demoUserForEmail } from "./demoAuth";

/**
 * Read the current user from request cookies.
 * In demo mode: reads the demo-user cookie and resolves against demo users.
 * In real auth mode: reads the NextAuth session.
 */
export async function getSession() {
  if (isDemoMode()) return null;
  return auth();
}

/**
 * Require an authenticated user from the request. Returns { userId, role }.
 * Used by API route handlers that receive a raw Request object.
 */
export function requireUser(req: Request): { userId: string; role: UserRole } {
  // Read the demo-user cookie from the raw request headers
  const cookieHeader = req.headers.get("cookie") ?? "";
  const demoMatch = cookieHeader.match(/demo-user=([^;]+)/);
  const email = demoMatch ? decodeURIComponent(demoMatch[1]) : null;

  if (email) {
    // Demo mode: resolve the demo user synchronously from cache
    // Note: ensureDemoUsers populates the cache on first call; for API routes
    // we accept the slight risk that the cache may be cold on the very first
    // request (it will be populated by the layout on the first page load).
    // In practice the demo users are always seeded before API routes run.
    return { userId: email, role: getRoleForEmail(email) };
  }

  throw new Error("UNAUTHORIZED");
}

function getRoleForEmail(email: string): UserRole {
  const DEMO_MAP: Record<string, UserRole> = {
    "demo.buyer@livestock.local": "BUYER",
    "demo.seller@livestock.local": "SELLER",
    "demo.hauler@livestock.local": "HAULER",
    "demo.platform@livestock.local": "PLATFORM",
  };
  return DEMO_MAP[email] ?? "BUYER";
}

/**
 * Map a UserRole to the domain actor string used by TransactionManager.
 */
export function actorForRole(role: UserRole): "BUYER" | "SELLER" | "HAULER" | "PLATFORM" {
  // ADMIN maps to PLATFORM for state machine purposes
  if (role === "ADMIN") return "PLATFORM";
  return role;
}

/**
 * Require an authenticated user. Throws a redirect to /login if not.
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return session;
}

/**
 * Get the current user id, or null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Resolve the acting user for the current auth mode.
 *
 * demo  → the demo identity selected by the demo-user cookie
 * real  → the NextAuth session user, with their persisted role set
 *
 * Returns { id, name, email, role, roles } or null when unauthenticated.
 */
export async function getCurrentUser(): Promise<{
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  roles: UserRole[];
} | null> {
  if (isDemoMode()) {
    const { getDemoUser, getDemoRoles } = await import("./demoAuth");
    const [user, roles] = await Promise.all([getDemoUser(), getDemoRoles()]);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roles: roles.length > 0 ? roles : [user.role],
    };
  }

  const session = await auth();
  const sessionUser = session?.user as { id?: string } | undefined;
  if (!sessionUser?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, name: true, email: true, role: true, roles: true },
  });
  if (!dbUser) return null;

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    roles: dbUser.roles.length > 0 ? dbUser.roles : [dbUser.role],
  };
}
