import { NextResponse } from "next/server";
import { prisma } from "@livestock/db";
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

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !targetUser.isActive },
    select: { id: true, isActive: true },
  });

  return NextResponse.json(updated);
}
