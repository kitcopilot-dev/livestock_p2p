import { NextResponse } from "next/server";
import { prisma, type UserRole } from "@livestock/db";
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
    select: { id: true, role: true },
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

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      role: role as UserRole,
      roles: [role as UserRole],
    },
    select: { id: true, role: true, roles: true },
  });

  return NextResponse.json(updated);
}
