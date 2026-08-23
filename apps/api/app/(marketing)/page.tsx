import Link from "next/link";
import { getCurrentUser } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getCurrentUser();

  // If authenticated, redirect to dashboard
  if (user) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-barn-600/20 via-dirt-900 to-pasture-600/15 p-8 sm:p-12">
        <div className="absolute inset-0 bg-gradient-to-t from-dirt-950/60 to-transparent" aria-hidden />
        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-cream-50 sm:text-5xl">
            Livestock commerce,{" "}
            <span className="text-hay-300">escrow protected</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-cream-300">
            Buy and sell livestock with confidence. Funds are held in escrow until delivery inspection clears.
            Every deal runs on our state machine with programmatic arbitration.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-barn-500 px-8 py-3.5 font-semibold text-on-color shadow-lg transition hover:bg-barn-400 hover:shadow-xl"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-dirt-600 bg-dirt-800/70 px-8 py-3.5 font-semibold text-cream-200 transition hover:border-cream-400/40 hover:text-cream-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section>
        <h2 className="text-center font-display text-2xl font-semibold text-cream-50 sm:text-3xl">
          How it works
        </h2>
        <p className="mt-3 text-center text-cream-400">
          Four simple steps from listing to settlement
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "1",
              title: "List or Browse",
              desc: "Sellers list livestock and processed goods. Buyers browse the marketplace with full transparency.",
              color: "bg-denim-400",
            },
            {
              step: "2",
              title: "Escrow Protected",
              desc: "Buyer funds are locked in escrow. Neither party can access funds until delivery is verified.",
              color: "bg-pasture-400",
            },
            {
              step: "3",
              title: "Ship & Inspect",
              desc: "Verified haulers transport the livestock. Buyers have 24 hours to inspect after delivery.",
              color: "bg-hay-400",
            },
            {
              step: "4",
              title: "Settle & Pay",
              desc: "Funds auto-release to seller and hauler. Disputes go to programmatic arbitration.",
              color: "bg-barn-400",
            },
          ].map(({ step, title, desc, color }) => (
            <div key={step} className="card p-6">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${color} text-lg font-bold text-ink`}
              >
                {step}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-cream-50">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-400">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-center font-display text-2xl font-semibold text-cream-50 sm:text-3xl">
          Built for trust
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: "🔒",
              title: "Escrow Protection",
              desc: "Funds are held securely until both parties fulfill their obligations. No more payment disputes.",
            },
            {
              icon: "⚖️",
              title: "Programmatic Arbitration",
              desc: "Fair, automated dispute resolution with evidence review. Split settlements available.",
            },
            {
              icon: "📊",
              title: "Double-Entry Ledger",
              desc: "Every cent is tracked with cryptographic audit trails. Hash-chained, append-only.",
            },
            {
              icon: "🚚",
              title: "Verified Haulers",
              desc: "DOT-registered carriers with real-time tracking. Freight paid through escrow.",
            },
            {
              icon: "🏥",
              title: "24-Hour Inspection",
              desc: "Buyers have a full day to inspect livestock. File disputes with photo evidence.",
            },
            {
              icon: "💳",
              title: "Multiple Payment Rails",
              desc: "Stripe and Dwolla ACH supported. Choose the rail that works for your operation.",
            },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="card p-6">
              <span className="text-3xl">{icon}</span>
              <h3 className="mt-4 font-display text-lg font-semibold text-cream-50">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-400">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="card bg-gradient-to-br from-denim-600/10 via-dirt-900 to-pasture-600/10 p-8 sm:p-12">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {[
            { value: "$2.4M+", label: "Escrowed to date" },
            { value: "1,200+", label: "Head transported" },
            { value: "98%", label: "On-time delivery" },
            { value: "0", label: "Lost funds" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="font-display text-3xl font-bold text-cream-50 sm:text-4xl">
                {value}
              </p>
              <p className="mt-2 text-sm text-cream-400">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-gradient-to-r from-barn-700 to-barn-600 p-8 text-center sm:p-12">
        <h2 className="font-display text-2xl font-bold text-on-color sm:text-3xl">
          Ready to transform your livestock operations?
        </h2>
        <p className="mt-4 text-on-color/80">
          Join hundreds of buyers, sellers, and haulers already using LivestockP2P.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/register"
            className="rounded-xl bg-on-color px-8 py-3.5 font-semibold text-barn-700 shadow-lg transition hover:shadow-xl"
          >
            Create Free Account
          </Link>
          <Link
            href="/marketplace"
            className="rounded-xl border-2 border-on-color/40 px-8 py-3.5 font-semibold text-on-color transition hover:border-on-color/70 hover:bg-on-color/10"
          >
            Browse Marketplace
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dirt-700/60 pt-8 text-center text-sm text-cream-500">
        <p>© 2026 LivestockP2P. Escrow-protected livestock commerce.</p>
        <div className="mt-4 flex items-center justify-center gap-6">
          <Link href="/login" className="hover:text-cream-300">
            Sign In
          </Link>
          <Link href="/register" className="hover:text-cream-300">
            Register
          </Link>
          <Link href="/marketplace" className="hover:text-cream-300">
            Marketplace
          </Link>
        </div>
      </footer>
    </div>
  );
}
