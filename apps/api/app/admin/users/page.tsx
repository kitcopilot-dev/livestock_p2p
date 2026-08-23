import { prisma } from "@livestock/db";
import { formatDate } from "../../../lib/format";
import { ToggleUserActive } from "./ToggleUserActive";
import { ChangeUserRole } from "./ChangeUserRole";

export const dynamic = "force-dynamic";

export const metadata = { title: "Manage Users - Admin" };

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      roles: true,
      isActive: true,
      kycStatus: true,
      createdAt: true,
      businessName: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-cream-50">
          User Management
        </h1>
        <p className="mt-1 text-sm text-cream-400">
          {users.length} total users · {users.filter((u) => u.isActive).length} active
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
            <tr>
              <th className="px-5 py-3.5 font-semibold">User</th>
              <th className="px-5 py-3.5 font-semibold">Role</th>
              <th className="px-5 py-3.5 font-semibold">Status</th>
              <th className="px-5 py-3.5 font-semibold">KYC</th>
              <th className="px-5 py-3.5 font-semibold">Created</th>
              <th className="px-5 py-3.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dirt-700/50">
            {users.map((user) => (
              <tr
                key={user.id}
                className="transition-colors hover:bg-dirt-800/40"
              >
                <td className="px-5 py-3.5">
                  <div>
                    <p className="font-medium text-cream-100">
                      {user.name ?? "Unnamed"}
                    </p>
                    <p className="text-xs text-cream-500">{user.email}</p>
                    {user.businessName && (
                      <p className="text-xs text-cream-500">
                        {user.businessName}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <ChangeUserRole
                    userId={user.id}
                    currentRole={user.role}
                    currentRoles={user.roles}
                  />
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`pill ${
                      user.isActive
                        ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200"
                        : "border-barn-500/60 bg-barn-500/15 text-barn-200"
                    }`}
                  >
                    <span
                      className={`dot ${
                        user.isActive ? "bg-pasture-400" : "bg-barn-400"
                      }`}
                    />
                    {user.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`pill ${
                      user.kycStatus === "APPROVED"
                        ? "border-pasture-500/60 bg-pasture-500/15 text-pasture-200"
                        : user.kycStatus === "PENDING"
                          ? "border-hay-500/60 bg-hay-500/15 text-hay-200"
                          : "border-dirt-600 bg-dirt-800 text-cream-400"
                    }`}
                  >
                    {user.kycStatus.toLowerCase()}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-cream-500">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-5 py-3.5">
                  <ToggleUserActive
                    userId={user.id}
                    isActive={user.isActive}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
