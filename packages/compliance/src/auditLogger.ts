import { Prisma, prisma } from "@livestock/db";
import { canonicalJson } from "@livestock/shared";
import { sha256Hex } from "./crypto";

export interface AuditEntry {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Append-only, tamper-evident audit log.
 *
 * Each row's hash chains to the previous row:
 *   hash_i = sha256(prevHash_{i-1} + canonicalJson(payload_i))
 * UPDATE/DELETE on the table is rejected by the `audit_log_append_only`
 * trigger, and `verifyChain()` detects any tampering or gap in the chain.
 */
export const auditLogger = {
  async write(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<string> {
    const payload = {
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    };

    // Small retry loop: two concurrent writers may read the same tail hash and
    // collide on the unique hash constraint. The loser re-reads and retries.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const tail = await tx.auditLog.findFirst({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { hash: true },
        });
        const prevHash = tail?.hash ?? "genesis";
        const hash = sha256Hex(`${prevHash}:${canonicalJson(payload)}`);
        const row = await tx.auditLog.create({
          data: {
            ...payload,
            before: entry.before ?? Prisma.JsonNull,
            after: entry.after ?? Prisma.JsonNull,
            prevHash,
            hash,
          },
        });
        return row.hash;
      } catch (err) {
        const isUniqueViolation =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isUniqueViolation || attempt === 2) {
          throw err;
        }
      }
    }
    throw new Error("unreachable");
  },

  /**
   * Recomputes the hash chain across the whole log. Returns the list of
   * broken links; an empty list means the log is intact.
   */
  async verifyChain(limit = 100_000): Promise<string[]> {
    const rows = await prisma.auditLog.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    const broken: string[] = [];
    let expectedPrev = "genesis";
    for (const row of rows) {
      if (row.prevHash !== expectedPrev) {
        broken.push(`${row.id}: prevHash mismatch`);
      }
      const payload = {
        actorUserId: row.actorUserId,
        actorRole: row.actorRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        before: row.before,
        after: row.after,
      };
      const expected = sha256Hex(`${expectedPrev}:${canonicalJson(payload)}`);
      if (row.hash !== expected) {
        broken.push(`${row.id}: hash mismatch`);
      }
      expectedPrev = row.hash;
    }
    return broken;
  },
};
