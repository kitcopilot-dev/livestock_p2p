import { NextResponse } from "next/server";
import { prisma } from "@livestock/db";
import { auditLogger } from "@livestock/compliance";
import { getCurrentUser } from "../../../../../../lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "PLATFORM")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, role: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent disabling yourself
  if (targetUser.id === user.id) {
    return NextResponse.json(
      { error: "Cannot disable your own account" },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextActive = !targetUser.isActive;
    const after = await tx.user.update({
      where: { id: userId },
      data: { isActive: nextActive },
      select: { id: true, isActive: true },
    });

    await auditLogger.write(tx, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "user.active_toggle",
      entityType: "USER",
      entityId: userId,
      ipAddress:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
      before: { isActive: targetUser.isActive },
      after: { isActive: after.isActive },
    });

    return after;
  });

  return NextResponse.json(updated);
}
