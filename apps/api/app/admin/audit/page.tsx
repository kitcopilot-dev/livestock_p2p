import { prisma } from "@livestock/db";
import { formatDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export const metadata = { title: "Audit Log - Admin" };

const ACTION_LABELS: Record<string, string> = {
  "user.role_change": "Role change",
  "user.active_toggle": "Account status",
};

function changeSummary(entry: {
  action: string;
  before: unknown;
  after: unknown;
}): string {
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  if (entry.action === "user.role_change") {
    return `${String(before.role ?? "?")} → ${String(after.role ?? "?")}`;
  }
  if (entry.action === "user.active_toggle") {
    const state = (v: unknown) => (v ? "Active" : "Disabled");
    return `${state(before.isActive)} → ${state(after.isActive)}`;
  }
  return "—";
}

function UserCell({ user }: { user?: { name: string | null; email: string } }) {
  if (!user) {
    return <span className="text-cream-500">Unknown user</span>;
  }
  return (
    <div>
      <p className="font-medium text-cream-100">{user.name ?? "Unnamed"}</p>
      <p className="text-xs text-cream-500">{user.email}</p>
    </div>
  );
}

export default async function AdminAuditPage() {
  const entries = await prisma.auditLog.findMany({
    where: { entityType: "USER" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });

  const userIds = new Set<string>();
  for (const e of entries) {
    if (e.actorUserId) userIds.add(e.actorUserId);
    userIds.add(e.entityId);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-cream-50">
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-cream-400">
          Tamper-evident record of admin actions — role changes and account
          status toggles on users.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-cream-400">
          No admin actions recorded yet. Changes you make in the Users panel
          will appear here.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-dirt-700/70 bg-dirt-900/60 text-[11px] uppercase tracking-[0.12em] text-cream-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Time</th>
                <th className="px-5 py-3.5 font-semibold">Action</th>
                <th className="px-5 py-3.5 font-semibold">By</th>
                <th className="px-5 py-3.5 font-semibold">Target user</th>
                <th className="px-5 py-3.5 font-semibold">Change</th>
                <th className="px-5 py-3.5 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dirt-700/50">
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="transition-colors hover:bg-dirt-800/40"
                >
                  <td className="whitespace-nowrap px-5 py-3 text-cream-400">
                    {formatDate(entry.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="pill border-dirt-600 bg-dirt-800 text-cream-300">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <UserCell user={byId.get(entry.actorUserId ?? "")} />
                    {entry.actorRole && (
                      <p className="mt-0.5 text-xs text-cream-500">
                        {entry.actorRole}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <UserCell user={byId.get(entry.entityId)} />
                  </td>
                  <td className="px-5 py-3 font-medium text-hay-200">
                    {changeSummary(entry)}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-cream-500">
                    {entry.ipAddress ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
