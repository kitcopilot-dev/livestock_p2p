"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_ROLE_EMAILS, ensureDemoUsers, setUserRoles, type DemoSpeed } from "../../lib/demoAuth";
import type { UserRole } from "@livestock/db";

/** Demo-only identity switcher. Sets the demo-user cookie and refreshes. */
export async function switchDemoRole(role: UserRole): Promise<{ ok: true }> {
  const users = await ensureDemoUsers();
  const user = users[role];
  const cookieStore = await cookies();
  cookieStore.set("demo-user", user.email, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  void DEMO_ROLE_EMAILS;
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Sets the active role set (multi-select viewport). `primary` becomes the
 * acting demo user (for action guards); the full set drives the unioned nav
 * and home view. At least one role is always enforced.
 */
export async function setDemoRoles(roles: UserRole[], primary: UserRole): Promise<{ ok: true }> {
  const users = await ensureDemoUsers();
  const user = users[primary];
  const cookieStore = await cookies();
  // Persist to the acting user's row so the unioned nav survives a full reload
  // (server-side source of truth, not a transient cookie).
  await setUserRoles(user.id, roles, primary);
  cookieStore.set("demo-user", user.email, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Sets the demo speed cookie which controls inspection/dispute windows. */
export async function setDemoSpeed(speed: DemoSpeed): Promise<{ ok: true }> {
  const cookieStore = await cookies();
  cookieStore.set("demo_speed", speed, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
