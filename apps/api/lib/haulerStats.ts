import { prisma } from "@livestock/db";

export interface HaulerTripStat {
  route: string;
  distanceMiles: number | null;
  completedAt: Date | null;
  dueAt: Date | null;
  onTime: boolean | null;
}

export interface HaulerStats {
  milesHauled: number;
  loadsCompleted: number;
  onTimeRate: number | null; // 0–100, null if no dated trips
  recentTrips: HaulerTripStat[];
}

export async function haulerStats(haulerId: string, recentTripsCount = 5): Promise<HaulerStats> {
  const [completedTrips, recentTrips] = await Promise.all([
    prisma.load.findMany({
      where: { haulerId, status: "COMPLETED" },
      select: { distanceMiles: true, completedAt: true, dueAt: true },
    }),
    prisma.load.findMany({
      where: { haulerId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { origin: true, destination: true, distanceMiles: true, completedAt: true, dueAt: true },
      take: recentTripsCount,
    }),
  ]);

  const milesHauled = completedTrips.reduce((acc, t) => acc + (t.distanceMiles ?? 0), 0);
  const loadsCompleted = completedTrips.length;
  const dated = completedTrips.filter((t) => t.completedAt && t.dueAt);
  const onTime = dated.filter((t) => t.completedAt! <= t.dueAt!).length;
  const onTimeRate = dated.length > 0 ? Math.round((onTime / dated.length) * 100) : null;

  return {
    milesHauled,
    loadsCompleted,
    onTimeRate,
    recentTrips: recentTrips.map((t) => ({
      route: t.origin + " → " + t.destination,
      distanceMiles: t.distanceMiles,
      completedAt: t.completedAt,
      dueAt: t.dueAt,
      onTime: t.completedAt && t.dueAt ? t.completedAt <= t.dueAt : null,
    })),
  };
}
