import Link from "next/link";
import { cookies } from "next/headers";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { DemoSpeedControl } from "../components/DemoSpeedControl";
import { type DemoSpeed } from "../lib/demoAuth";
import { ThemeToggle } from "../components/ThemeToggle";
import { MobileNav } from "../components/MobileNav";
import { getCurrentUser, isDemoMode } from "../lib/auth";
import { getDemoRole } from "../lib/demoAuth";
import { logout } from "./actions/auth";
import type { UserRole } from "@livestock/db";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Livestock P2P — Marketplace",
  description: "P2P livestock commerce — escrow, freight, and arbitration demo",
};

/**
 * Role-scoped navigation. Each entry lists the roles that may see it. The
 * demo assigns a single role per user, so the active view is the one selected
 * role; the union below (`some`) means a future multi-role user sees the
 * merged set of everything their roles are permitted to see.
 */
const NAV: Array<{ href: string; label: string; roles: UserRole[] }> = [
  { href: "/", label: "Dashboard", roles: ["BUYER", "SELLER", "HAULER", "PLATFORM"] },
  { href: "/profile", label: "Profile", roles: ["BUYER", "SELLER", "HAULER", "PLATFORM"] },
  { href: "/marketplace", label: "Marketplace", roles: ["BUYER", "SELLER", "PLATFORM"] },
  { href: "/seller", label: "Seller", roles: ["SELLER"] },
  { href: "/loads", label: "Loads", roles: ["HAULER", "SELLER", "PLATFORM"] },
  { href: "/earnings", label: "Earnings", roles: ["HAULER"] },
  { href: "/offers", label: "Offers", roles: ["BUYER", "SELLER"] },
  { href: "/escrows", label: "Escrows", roles: ["BUYER", "SELLER", "HAULER", "PLATFORM"] },
  { href: "/disputes", label: "Disputes", roles: ["BUYER", "SELLER", "HAULER", "PLATFORM"] },
  { href: "/ledger", label: "Ledger", roles: ["PLATFORM"] },
  { href: "/settings", label: "Settings", roles: ["PLATFORM", "ADMIN"] },
  { href: "/admin", label: "Admin", roles: ["ADMIN", "PLATFORM"] },
];

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
      {/* Simple barn silhouette */}
      <path d="M4 11 12 4l8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V20h12v-9.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 20v-5h4v5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.5 12.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [role, currentUser] = await Promise.all([getDemoRole(), getCurrentUser()]);
  const user = currentUser ?? { name: null as string | null, email: "", role: "BUYER" as UserRole };
  const roles = currentUser?.roles ?? ["BUYER"];
  const visibleNav = NAV.filter((item) => roles.some((r) => item.roles.includes(r)));
  const cookieStore = await cookies();
  const theme = cookieStore.get("theme")?.value === "dark" ? "dark" : "light";
  const demoSpeed = (cookieStore.get("demo_speed")?.value ?? "normal") as DemoSpeed;
  return (
    <html lang="en" data-theme={theme} className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-30 border-b border-dirt-700/60 bg-dirt-950/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-7">
              <Link href="/" className="group flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-barn-400 to-barn-600 text-on-color shadow-[0_4px_14px_-4px_rgba(201,80,46,0.7)] transition-transform group-hover:scale-105">
                  <BrandMark />
                </span>
                <span className="leading-tight">
                  <span className="block font-display text-lg font-semibold tracking-tight text-cream-50">
                    Livestock<span className="text-hay-400">P2P</span>
                  </span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-cream-500">
                    Commerce &amp; freight
                  </span>
                </span>
              </Link>
              <MobileNav items={visibleNav.map(({ href, label }) => ({ href, label }))} />
              <nav className="hidden items-center gap-1 sm:flex">
                {visibleNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-cream-300 transition-colors hover:bg-dirt-800 hover:text-cream-50"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              {isDemoMode() ? (
                <>
                  <span className="hidden items-center gap-2 rounded-full border border-dirt-600 bg-dirt-800/70 px-3 py-1 text-xs text-cream-300 md:inline-flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-pasture-400" />
                    acting as <span className="font-semibold text-cream-100">{user.name}</span>
                  </span>
                  <DemoSpeedControl current={demoSpeed} />
                </>
              ) : (
                currentUser && (
                  <span className="hidden items-center gap-2 rounded-full border border-dirt-600 bg-dirt-800/70 px-3 py-1 text-xs text-cream-300 md:inline-flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-pasture-400" />
                    {user.name ?? user.email}
                  </span>
                )
              )}
              <ThemeToggle initial={theme} />
              {isDemoMode() ? (
                <RoleSwitcher current={role} selected={roles} />
              ) : currentUser ? (
                <form action={logout}>
                  <button type="submit" className="rounded-lg border border-dirt-600 bg-dirt-800/70 px-3 py-1.5 text-xs font-medium text-cream-300 transition hover:bg-dirt-700 hover:text-cream-100">
                    Sign out
                  </button>
                </form>
              ) : (
                <Link
                  href="/login"
                  className="rounded-lg bg-barn-500 px-3 py-1.5 text-xs font-semibold text-on-color transition hover:bg-barn-400"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-12 pt-4 text-center text-xs text-cream-500">
          Demo console · BullMQ time-locks, double-entry ledger &amp; programmatic arbitration on local Postgres/Redis
        </footer>
      </body>
    </html>
  );
}
