import Link from "next/link";
import { getCurrentUser } from "../../lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN" && user.role !== "PLATFORM") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-dirt-700/60 pb-4">
        <Link
          href="/admin"
          className="font-display text-lg font-semibold text-cream-50 hover:text-hay-200"
        >
          Admin
        </Link>
        <Link
          href="/admin/users"
          className="text-sm text-cream-400 hover:text-cream-200"
        >
          Users
        </Link>
        <Link
          href="/settings"
          className="text-sm text-cream-400 hover:text-cream-200"
        >
          Settings
        </Link>
        <Link
          href="/dashboard"
          className="ml-auto text-sm text-cream-400 hover:text-cream-200"
        >
          ← Back to Dashboard
        </Link>
      </div>
      {children}
    </div>
  );
}
