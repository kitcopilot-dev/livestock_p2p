"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@livestock/db";

const ROLES: UserRole[] = ["BUYER", "SELLER", "HAULER", "PLATFORM", "ADMIN"];

export function ChangeUserRole({
  userId,
  currentRole,
  currentRoles,
}: {
  userId: string;
  currentRole: UserRole;
  currentRoles: UserRole[];
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function changeRole(newRole: UserRole) {
    if (newRole === currentRole) return;
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <select
      value={currentRole}
      onChange={(e) => changeRole(e.target.value as UserRole)}
      disabled={pending}
      className="rounded-lg border border-dirt-600 bg-dirt-950 px-2 py-1.5 text-xs text-cream-100 focus:border-hay-400 focus:outline-none"
    >
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {role.charAt(0) + role.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}
