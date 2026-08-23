"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ToggleUserActive({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle-active`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        isActive
          ? "border border-barn-500/40 text-barn-200 hover:bg-barn-500/10"
          : "border border-pasture-500/40 text-pasture-200 hover:bg-pasture-500/10"
      }`}
    >
      {pending ? "..." : isActive ? "Disable" : "Enable"}
    </button>
  );
}
