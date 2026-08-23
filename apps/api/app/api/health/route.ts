import { prisma } from "@livestock/db";
import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up", latencyMs: Date.now() - started });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
