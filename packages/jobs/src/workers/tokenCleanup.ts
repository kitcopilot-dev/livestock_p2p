import { prisma } from "@livestock/db";
import { logger } from "../logger";

/**
 * One-time auth token cleanup.
 *
 * PasswordResetToken and MagicLink rows are single-use; once used or past
 * their expiry they serve no purpose and only accumulate. This runs on the
 * recurring sweep (every 5 minutes) so both tables stay small.
 */
export async function runTokenCleanup(now: Date = new Date()): Promise<{
  deletedResetTokens: number;
  deletedMagicLinks: number;
}> {
  const [resetTokens, magicLinks] = await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
    prisma.magicLink.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
  ]);

  const result = {
    deletedResetTokens: resetTokens.count,
    deletedMagicLinks: magicLinks.count,
  };
  if (result.deletedResetTokens > 0 || result.deletedMagicLinks > 0) {
    logger.info(result, "token cleanup: deleted expired/used auth tokens");
  }
  return result;
}
