/**
 * Seed three test users — one per role (BUYER, SELLER, HAULER) — with real
 * login credentials so the password auth flow can be exercised end-to-end.
 *
 * Idempotent: upserts by email, re-hashes the password, and ensures each user
 * has a provisioned USER_WALLET ledger account mapped to the configured rail.
 *
 * Run from repo root with env loaded:
 *   set -a && source .env && set +a
 *   cd packages/db && ./node_modules/.bin/tsx ../../apps/api/scripts/seedTestUsers.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "@livestock/db";

const PASSWORD = process.env.TEST_USER_PASSWORD ?? "TestPass123!";

const TEST_USERS = [
  {
    email: "test.buyer@livestock.local",
    name: "Taylor Test Buyer",
    role: "BUYER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Taylor Livestock Acquisitions",
    phone: "+1-555-0101",
  },
  {
    email: "test.seller@livestock.local",
    name: "Sally Test Seller",
    role: "SELLER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Sally's Ranch & Feedlot",
    phone: "+1-555-0102",
    einTaxId: "12-3456789",
  },
  {
    email: "test.hauler@livestock.local",
    name: "Hank Test Hauler",
    role: "HAULER" as const,
    kycStatus: "APPROVED" as const,
    businessName: "Hank's Hotshot Livestock Hauling",
    phone: "+1-555-0103",
    dotNumber: "1234567",
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const rail = process.env.PAYMENT_RAIL_DEFAULT ?? "STRIPE";
  const created: Record<string, string> = {};

  for (const spec of TEST_USERS) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      create: {
        email: spec.email,
        name: spec.name,
        role: spec.role,
        roles: [spec.role],
        kycStatus: spec.kycStatus,
        businessName: spec.businessName,
        phone: spec.phone,
        einTaxId: spec.einTaxId,
        dotNumber: spec.dotNumber,
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
        phone: spec.phone,
        einTaxId: spec.einTaxId,
        dotNumber: spec.dotNumber,
        passwordHash,
        onboardingCompletedAt: new Date(),
      },
    });

    const ref =
      rail === "DWOLLA"
        ? `https://api-sandbox.dwolla.com/funding-sources/test_${spec.role.toLowerCase()}`
        : `acct_test_${spec.role.toLowerCase()}`;

    await prisma.ledgerAccount.upsert({
      where: {
        ownerType_ownerUserId_accountType: {
          ownerType: "USER",
          ownerUserId: user.id,
          accountType: "USER_WALLET",
        },
      },
      create: {
        ownerType: "USER",
        ownerUserId: user.id,
        accountType: "USER_WALLET",
        currency: "USD",
        externalAccountRef: ref,
      },
      update: { externalAccountRef: ref },
    });

    created[spec.role] = user.id;
    console.log(`✔ ${spec.role.padEnd(6)} ${spec.email}  (${user.id})`);
  }

  // --- Demo data for the test users ----------------------------------------

  // Seller: a few ACTIVE listings so the seller dashboard and marketplace
  // show real lots (mirrors the reseed script's field shape).
  const sellerId = created.SELLER;
  const sellerListings = [
    {
      species: "CATTLE" as const, breed: "Simmental Steers", headCount: 110, avgWeightLbs: 1220,
      pricePerLbCents: 240, priceType: "PER_POUND" as const, loadType: "FULL_LOAD" as const,
      tier: "COMMERCIAL" as const, description: "Simmental steers, grain-fed 120 days. Health papers ready.",
      location: "Amarillo, TX", zipCode: "79101", gender: "STEER" as const, ageRange: "12-15 months",
      healthStatus: "Healthy, vaccinated", husbandry: "Grain-fed (120 days)", condition: "BCS 5",
      imageUrl: "/uploads/seed/hereford.jpg", galleryUrls: ["/uploads/seed/hereford.jpg"],
    },
    {
      species: "HOG" as const, breed: "Duroc Hogs", headCount: 140, avgWeightLbs: 265,
      pricePerLbCents: 310, priceType: "PER_HEAD" as const, pricePerHeadCents: 82150, loadType: "LTL" as const,
      tier: "COMMERCIAL" as const, description: "Duroc hogs, antibiotic-free. Excellent carcass cut-out.",
      location: "Tulsa, OK", zipCode: "74101", gender: "BARROW" as const, ageRange: "6-7 months",
      healthStatus: "Antibiotic-free", husbandry: "Pasture-raised", condition: "BCS 3",
      imageUrl: "/uploads/seed/berkshire.jpg", galleryUrls: ["/uploads/seed/berkshire.jpg"],
    },
    {
      species: "SHEEP" as const, breed: "Hampshire Lambs", headCount: 180, avgWeightLbs: 125,
      pricePerLbCents: 385, priceType: "PER_POUND" as const, loadType: "FULL_LOAD" as const,
      tier: "REGISTERED" as const, description: "Registered Hampshire lambs, terminal sire quality.",
      location: "Kansas City, MO", zipCode: "64101", gender: "WETHER" as const, ageRange: "7-10 months",
      healthStatus: "Healthy, dewormed", husbandry: "Pasture-raised", condition: "BCS 4",
      imageUrl: "/uploads/seed/dorper.jpg", galleryUrls: ["/uploads/seed/dorper.jpg"],
    },
  ];
  for (const l of sellerListings) {
    const existing = await prisma.listing.findFirst({ where: { sellerId, breed: l.breed } });
    if (!existing) {
      await prisma.listing.create({ data: { sellerId, ...l } });
      console.log(`✔ Listing: ${l.breed}`);
    } else {
      console.log(`• Listing exists: ${l.breed}`);
    }
  }

  // Hauler: historical completed trips so the load-board hero and earnings
  // page show mileage / loads / on-time stats for Hank.
  const haulerId = created.HAULER;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const trips = [
    { origin: "Greeley, CO", destination: "Denver, CO", distanceMiles: 85, freightPayCents: 78000, headCount: 90, totalWeightLbs: 112500, acceptedAt: new Date(now - 21 * day), completedAt: new Date(now - 20 * day + 4 * 3600 * 1000), dueAt: new Date(now - 20 * day + 6 * 3600 * 1000) },
    { origin: "Amarillo, TX", destination: "Lubbock, TX", distanceMiles: 120, freightPayCents: 115000, headCount: 85, totalWeightLbs: 100300, acceptedAt: new Date(now - 14 * day), completedAt: new Date(now - 13 * day + 5 * 3600 * 1000), dueAt: new Date(now - 13 * day + 7 * 3600 * 1000) },
    { origin: "Oklahoma City, OK", destination: "Tulsa, OK", distanceMiles: 105, freightPayCents: 99000, headCount: 120, totalWeightLbs: 150000, acceptedAt: new Date(now - 9 * day), completedAt: new Date(now - 8 * day + 3 * 3600 * 1000), dueAt: new Date(now - 8 * day + 8 * 3600 * 1000) },
    { origin: "Wichita, KS", destination: "Kansas City, MO", distanceMiles: 190, freightPayCents: 174000, headCount: 95, totalWeightLbs: 128250, acceptedAt: new Date(now - 2 * day), completedAt: new Date(now - 1 * day + 6 * 3600 * 1000), dueAt: new Date(now - 1 * day + 9 * 3600 * 1000) },
  ];
  for (const t of trips) {
    const existing = await prisma.load.findFirst({ where: { haulerId, origin: t.origin, destination: t.destination } });
    if (!existing) {
      await prisma.load.create({
        data: { ...t, species: "CATTLE", loadType: "FULL_LOAD", marketplace: "LIVE", haulerId, posterId: sellerId, status: "COMPLETED", paidAt: t.completedAt },
      });
    }
  }
  console.log(`✔ Seeded ${trips.length} historical trips for the hauler`);

  await prisma.$disconnect();
  console.log("\nTest users ready.");
  console.log(`Password for all: ${PASSWORD}`);
  console.log("To use them with real auth, set AUTH_METHOD=password in .env and log in at /login.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
