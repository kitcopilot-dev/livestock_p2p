import { NextResponse } from "next/server";
import { prisma, type UserRole } from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { getCurrentUser } from "../../../../../../lib/auth";

const VALID_ROLES: UserRole[] = ["BUYER", "SELLER", "HAULER", "PLATFORM", "ADMIN"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "PLATFORM")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  const body = await request.json();
  const { role } = body;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be one of: " + VALID_ROLES.join(", ") },
      { status: 400 },
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, roles: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent changing your own role
  if (targetUser.id === user.id) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.user.update({
      where: { id: userId },
      data: {
        role: role as UserRole,
        roles: [role as UserRole],
      },
      select: { id: true, role: true, roles: true },
    });

    await auditLogger.write(tx, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "user.role_change",
      entityType: "USER",
      entityId: userId,
      ipAddress:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
      before: { role: targetUser.role, roles: targetUser.roles },
      after: { role: after.role, roles: after.roles },
    });

    return after;
  });

  return NextResponse.json(updated);
}
