import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@livestock/db";
import { truncateAll } from "@livestock/db/testing";
import { runTokenCleanup } from "../src/workers/tokenCleanup";

const now = new Date("2026-08-23T12:00:00Z");

beforeAll(async () => {
  await truncateAll();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedResetToken(email: string, token: string, expiresAt: Date, usedAt?: Date) {
  return prisma.passwordResetToken.create({ data: { email, token, expiresAt, usedAt } });
}

async function seedMagicLink(email: string, token: string, expiresAt: Date, usedAt?: Date) {
  return prisma.magicLink.create({ data: { email, token, expiresAt, usedAt } });
}

describe("runTokenCleanup", () => {
  it("deletes expired and used tokens, keeps valid ones", async () => {
    // PasswordResetToken rows
    await seedResetToken("a@test.local", "reset-expired", new Date(now.getTime() - 60_000));
    await seedResetToken("b@test.local", "reset-used", new Date(now.getTime() + 3_600_000), new Date());
    await seedResetToken("c@test.local", "reset-valid", new Date(now.getTime() + 3_600_000));

    // MagicLink rows
    await seedMagicLink("a@test.local", "magic-expired", new Date(now.getTime() - 60_000));
    await seedMagicLink("b@test.local", "magic-used", new Date(now.getTime() + 3_600_000), new Date());
    await seedMagicLink("c@test.local", "magic-valid", new Date(now.getTime() + 3_600_000));

    const result = await runTokenCleanup(now);

    expect(result).toEqual({ deletedResetTokens: 2, deletedMagicLinks: 2 });

    const remainingResets = await prisma.passwordResetToken.findMany({ select: { token: true } });
    expect(remainingResets.map((r) => r.token)).toEqual(["reset-valid"]);

    const remainingMagic = await prisma.magicLink.findMany({ select: { token: true } });
    expect(remainingMagic.map((r) => r.token)).toEqual(["magic-valid"]);
  });

  it("is a no-op when there is nothing to clean", async () => {
    await truncateAll();
    await seedResetToken("c@test.local", "reset-valid", new Date(now.getTime() + 3_600_000));
    await seedMagicLink("c@test.local", "magic-valid", new Date(now.getTime() + 3_600_000));

    const result = await runTokenCleanup(now);
    expect(result).toEqual({ deletedResetTokens: 0, deletedMagicLinks: 0 });
  });
});
