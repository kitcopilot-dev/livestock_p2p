/**
 * Seed all accounts with known passwords for testers.
 *
 * Run from repo root:
 *   set -a && source .env && set +a
 *   npx tsx apps/api/scripts/seedAccounts.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "@livestock/db";

const PASSWORD = "TestPass123!";

const ACCOUNTS = [
  // Admin
  {
    email: "admin@livestockp2p.local",
    name: "Admin User",
    role: "ADMIN" as const,
    kycStatus: "APPROVED" as const,
    businessName: "LivestockP2P Platform",
  },
  // Buyers
  {
    email: "buyer1@livestockp2p.local",
    name: "Dana Buyer",
    role: "BUYER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Dana Livestock Procurement",
  },
  {
    email: "buyer2@livestockp2p.local",
    name: "Jordan Buyer",
    role: "BUYER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Jordan Ranch Supplies",
  },
  // Sellers
  {
    email: "seller@livestockp2p.local",
    name: "Sam Seller",
    role: "SELLER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Sam's Ranch & Feedlot",
  },
  {
    email: "processor@livestockp2p.local",
    name: "Paula Processor",
    role: "SELLER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Paula's Processing Co",
  },
  // Haulers
  {
    email: "hauler@livestockp2p.local",
    name: "Hal Hauler",
    role: "HAULER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Hal's Hotshot Hauling",
  },
  {
    email: "rig@livestockp2p.local",
    name: "Randy Rig",
    role: "HAULER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Randy's Rig Service",
  },
  // Platform
  {
    email: "platform@livestockp2p.local",
    name: "Platform Operator",
    role: "PLATFORM" as const,
    kycStatus: "APPROVED" as const,
    businessName: "LivestockP2P Operations",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  console.log("Seeding accounts...\n");

  for (const spec of ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        email: spec.email,
        name: spec.name,
        role: spec.role,
        roles: [spec.role],
        kycStatus: spec.kycStatus,
        businessName: spec.businessName,
        passwordHash,
        onboardingCompletedAt: new Date(),
        accounts: {
          create: {
            type: "credentials",
            provider: "credentials",
            providerAccountId: spec.email,
          },
        },
      },
      update: {
        name: spec.name,
        role: spec.role,
        roles: [spec.role],
        kycStatus: spec.kycStatus,
        businessName: spec.businessName,
        passwordHash,
        onboardingCompletedAt: new Date(),
      },
    });

    console.log(`✓ ${spec.role.padEnd(10)} ${spec.email}  (${user.id})`);
  }

  await prisma.$disconnect();

  console.log("\n" + "=".repeat(60));
  console.log("ALL ACCOUNTS SEEDED");
  console.log("=".repeat(60));
  console.log(`Password for all accounts: ${PASSWORD}`);
  console.log("\nAccounts:");
  console.log("-".repeat(60));
  for (const spec of ACCOUNTS) {
    console.log(`  ${spec.role.padEnd(10)} ${spec.email}`);
  }
  console.log("-".repeat(60));
  console.log("\nTo use password auth, set AUTH_METHOD=password in .env");
  console.log("Then visit /login to sign in.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
