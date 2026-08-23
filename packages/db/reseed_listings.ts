import { prisma } from "./src/index.js";

async function wallet(userId: string, ref: string) {
  await prisma.ledgerAccount.upsert({
    where: { ownerType_ownerUserId_accountType: { ownerType: "USER", ownerUserId: userId, accountType: "USER_WALLET" } },
    create: { ownerType: "USER", ownerUserId: userId, accountType: "USER_WALLET", currency: "USD", externalAccountRef: ref },
    update: { externalAccountRef: ref },
  });
}

/** Destination ref for the configured payout rail (defaults to Stripe). */
async function demoRef(name: string): Promise<string> {
  const setting = await prisma.platformSetting.findUnique({ where: { key: "paymentRail" } });
  return setting?.value === "DWOLLA"
    ? `https://api-sandbox.dwolla.com/funding-sources/demo_${name}`
    : `acct_demo_${name}`;
}

async function seed() {
  const seller = await prisma.user.upsert({
    where: { email: "demo.seller@livestock.local" },
    create: { email: "demo.seller@livestock.local", name: "Sam Seller", role: "SELLER", roles: ["SELLER"], kycStatus: "APPROVED" },
    update: { roles: ["SELLER"] },
  });
  const processor = await prisma.user.upsert({
    where: { email: "demo.processor@livestock.local" },
    create: { email: "demo.processor@livestock.local", name: "Paula Processor", role: "SELLER", roles: ["SELLER"], kycStatus: "APPROVED" },
    update: { roles: ["SELLER"] },
  });
  const rig = await prisma.user.upsert({
    where: { email: "demo.rig@livestock.local" },
    create: { email: "demo.rig@livestock.local", name: "Randy Rig", role: "HAULER", roles: ["HAULER"], kycStatus: "APPROVED" },
    update: { roles: ["HAULER"] },
  });
  const hal = await prisma.user.upsert({
    where: { email: "demo.hauler@livestock.local" },
    create: { email: "demo.hauler@livestock.local", name: "Hal Hauler", role: "HAULER", roles: ["HAULER"], kycStatus: "APPROVED" },
    update: { roles: ["HAULER"] },
  });
  await wallet(processor.id, await demoRef("processor"));
  await wallet(rig.id, await demoRef("rig"));
  await wallet(hal.id, await demoRef("hauler"));
  console.log("Seller:", seller.id);
  console.log("Hauler:", hal.id);
  console.log("Processor:", processor.id);
  console.log("Rig:", rig.id);

  // Clear offers (and their line items) before listings — OfferItem holds a
  // RESTRICT FK on Listing, so stale offers from a prior demo session would
  // block the delete.
  await prisma.offer.deleteMany({});
  await prisma.load.deleteMany({});
  const existing = await prisma.listing.deleteMany({});
  // Historical trips for the demo hauler (Hal) so the load-board hero shows
  // meaningful trip stats: miles hauled, loads completed, on-time rate.
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const history = [
    { origin: "Greeley, CO", destination: "Denver, CO", distanceMiles: 85, freightPayCents: 78000, headCount: 90, totalWeightLbs: 112500, acceptedAt: new Date(now - 21 * day), completedAt: new Date(now - 20 * day + 4 * 3600 * 1000), dueAt: new Date(now - 20 * day + 6 * 3600 * 1000), posterId: seller.id },
    { origin: "Amarillo, TX", destination: "Lubbock, TX", distanceMiles: 120, freightPayCents: 115000, headCount: 85, totalWeightLbs: 100300, acceptedAt: new Date(now - 14 * day), completedAt: new Date(now - 13 * day + 5 * 3600 * 1000), dueAt: new Date(now - 13 * day + 7 * 3600 * 1000), posterId: seller.id },
    { origin: "Oklahoma City, OK", destination: "Tulsa, OK", distanceMiles: 105, freightPayCents: 99000, headCount: 120, totalWeightLbs: 150000, acceptedAt: new Date(now - 9 * day), completedAt: new Date(now - 8 * day + 3 * 3600 * 1000), dueAt: new Date(now - 8 * day + 8 * 3600 * 1000), posterId: seller.id },
    { origin: "Fayetteville, AR", destination: "Memphis, TN", distanceMiles: 230, freightPayCents: 210000, headCount: 200, totalWeightLbs: 56000, acceptedAt: new Date(now - 5 * day), completedAt: new Date(now - 4 * day + 8 * 3600 * 1000), dueAt: new Date(now - 4 * day + 7 * 3600 * 1000), posterId: seller.id },
    { origin: "Wichita, KS", destination: "Kansas City, MO", distanceMiles: 190, freightPayCents: 174000, headCount: 95, totalWeightLbs: 128250, acceptedAt: new Date(now - 2 * day), completedAt: new Date(now - 1 * day + 6 * 3600 * 1000), dueAt: new Date(now - 1 * day + 9 * 3600 * 1000), posterId: seller.id },
  ];
  for (const h of history) {
    await prisma.load.create({
      data: { ...h, species: "CATTLE", loadType: "FULL_LOAD", marketplace: "LIVE", haulerId: hal.id, status: "COMPLETED", paidAt: h.completedAt },
    });
  }
  console.log("Seeded", history.length, "historical loads for Hal");

  // Randy's trip history: 3 completed loads (2 on-time, 1 late — 67% on-time)
  const randyHistory = [
    { origin: "Sioux Falls, SD", destination: "Omaha, NE", distanceMiles: 180, freightPayCents: 62000, headCount: 75, totalWeightLbs: 97500, acceptedAt: new Date(now - 18 * day), completedAt: new Date(now - 17 * day + 2 * 3600 * 1000), dueAt: new Date(now - 17 * day + 5 * 3600 * 1000), posterId: seller.id },
    { origin: "Des Moines, IA", destination: "Chicago, IL", distanceMiles: 330, freightPayCents: 350000, headCount: 110, totalWeightLbs: 132000, acceptedAt: new Date(now - 10 * day), completedAt: new Date(now - 9 * day + 4 * 3600 * 1000), dueAt: new Date(now - 9 * day + 6 * 3600 * 1000), posterId: seller.id },
    { origin: "Billings, MT", destination: "Rapid City, SD", distanceMiles: 320, freightPayCents: 280000, headCount: 80, totalWeightLbs: 96000, acceptedAt: new Date(now - 7 * day), completedAt: new Date(now - 6 * day + 10 * 3600 * 1000), dueAt: new Date(now - 6 * day + 5 * 3600 * 1000), posterId: seller.id },
  ];
  for (const h of randyHistory) {
    await prisma.load.create({
      data: { ...h, species: "CATTLE", loadType: "FULL_LOAD", marketplace: "LIVE", haulerId: rig.id, status: "COMPLETED", paidAt: h.completedAt },
    });
  }
  console.log("Seeded", randyHistory.length, "historical loads for Randy");


  console.log("Deleted", existing.count, "old listings");

  // Delete stale documents from a prior seed first
  await prisma.listingDocument.deleteMany({});

  const listings = [
    { sellerId: seller.id, species: "CATTLE" as const, breed: "Angus", headCount: 120, avgWeightLbs: 1250, priceType: "PER_POUND" as const, pricePerLbCents: 245, loadType: "FULL_LOAD" as const, tier: "COMMERCIAL" as const, description: "Premium Angus steers, grain-fed 150 days. USDA Choice. Pre-conditioned.", location: "Oklahoma City, OK", zipCode: "73102", gender: "STEER" as const, ageRange: "12-16 months", healthStatus: "Healthy, USDA inspected", origin: "Oklahoma City, OK", registry: "None", listingClass: "Steers", husbandry: "Grain-fed (150 days)", frame: "Large", vaccines: "7-way blackleg, IBR/BVD/PI3/BRSV", condition: "BCS 5.5", fertility: "N/A", registryType: "Commercial", birthWeightLbs: 82, imageUrl: "/uploads/seed/angus.jpg", galleryUrls: ["/uploads/seed/angus.jpg"], status: "ACTIVE" as const, docs: [{ fileName: "Health Certificate — Angus Lot", kind: "HEALTH_CERT" as const }] },
    { sellerId: seller.id, species: "CATTLE" as const, breed: "Hereford", headCount: 85, avgWeightLbs: 1180, priceType: "PER_HEAD" as const, pricePerLbCents: 225, pricePerHeadCents: 265000, loadType: "LTL" as const, tier: "REGISTERED" as const, description: "Hereford heifers, range-raised on native grass.", location: "Amarillo, TX", zipCode: "79101", gender: "HEIFER" as const, ageRange: "14-18 months", healthStatus: "Healthy, vaccinated", origin: "Amarillo, TX", registry: "American Hereford Association", listingClass: "Heifers", husbandry: "Grass-fed, range-raised", frame: "Medium", vaccines: "5-way lepto, 7-way blackleg", condition: "BCS 5", fertility: "Exposed to registered bull", registryType: "Registered", birthWeightLbs: 78, imageUrl: "/uploads/seed/hereford.jpg", galleryUrls: ["/uploads/seed/hereford.jpg"], status: "ACTIVE" as const, docs: [] },
    { sellerId: seller.id, species: "HOG" as const, breed: "Berkshire (Kurobuta)", headCount: 200, avgWeightLbs: 280, priceType: "PER_HEAD" as const, pricePerLbCents: 320, pricePerHeadCents: 89600, loadType: "LTL" as const, tier: "COMMERCIAL" as const, description: "Heritage Berkshire hogs, pasture-raised, antibiotic-free.", location: "Fayetteville, AR", zipCode: "72701", gender: "BARROW" as const, ageRange: "6-8 months", healthStatus: "Antibiotic-free, pastured", origin: "Fayetteville, AR", registry: "None", listingClass: "Barrows", husbandry: "Pasture-raised, antibiotic-free", frame: "Medium", vaccines: "PCV2, Mycoplasma", condition: "BCS 3", fertility: "N/A", registryType: "Commercial", birthWeightLbs: 3, imageUrl: "/uploads/seed/berkshire.jpg", galleryUrls: ["/uploads/seed/berkshire.jpg"], status: "ACTIVE" as const, docs: [] },
    { sellerId: seller.id, species: "SHEEP" as const, breed: "Dorper", headCount: 150, avgWeightLbs: 135, priceType: "PER_POUND" as const, pricePerLbCents: 410, loadType: "FULL_LOAD" as const, tier: "REGISTERED" as const, description: "Dorper sheep, hair breed. Excellent carcass yield.", location: "Memphis, TN", zipCode: "38101", gender: "WETHER" as const, ageRange: "8-12 months", healthStatus: "Healthy, dewormed", origin: "Memphis, TN", registry: "American Dorper Sheep Association", listingClass: "Wethers", husbandry: "Pasture-raised", frame: "Medium", vaccines: "CD/T, Ovine progressive pneumonia", condition: "BCS 4", fertility: "N/A", registryType: "Registered", birthWeightLbs: 8, imageUrl: "/uploads/seed/dorper.jpg", galleryUrls: ["/uploads/seed/dorper.jpg"], status: "ACTIVE" as const, docs: [] },
    { sellerId: seller.id, species: "GOAT" as const, breed: "Boer", headCount: 100, avgWeightLbs: 80, priceType: "PER_HEAD" as const, pricePerLbCents: 380, pricePerHeadCents: 30400, loadType: "LTL" as const, tier: "COMMERCIAL" as const, description: "Boer goats, premier meat goat breed.", location: "Nashville, TN", zipCode: "37201", gender: "MIX" as const, ageRange: "4-6 months", healthStatus: "Healthy, CDT vaccinated", origin: "Nashville, TN", registry: "None", listingClass: "Kids", husbandry: "Pasture-raised", frame: "Medium", vaccines: "CD/T", condition: "BCS 4", fertility: "N/A", registryType: "Commercial", birthWeightLbs: 7, imageUrl: "/uploads/seed/boer.jpg", galleryUrls: ["/uploads/seed/boer.jpg"], status: "ACTIVE" as const, docs: [] },
    { sellerId: seller.id, species: "CATTLE" as const, breed: "Charolais", headCount: 95, avgWeightLbs: 1350, priceType: "PER_POUND" as const, pricePerLbCents: 238, loadType: "FULL_LOAD" as const, tier: "REGISTERED" as const, description: "Charolais bulls and steers, heavy muscled. AI-sired.", location: "Wichita, KS", zipCode: "67201", gender: "BULL" as const, ageRange: "18-22 months", healthStatus: "Healthy, BSE examined", origin: "Wichita, KS", registry: "American-International Charolais Association", listingClass: "Bulls", husbandry: "Grain-fed, performance-tested", frame: "Large", vaccines: "7-way blackleg, BVD-PI3", condition: "BCS 6", fertility: "Breeding soundness examined", registryType: "Registered", birthWeightLbs: 90, imageUrl: "/uploads/seed/charolais.jpg", galleryUrls: ["/uploads/seed/charolais.jpg"], status: "ACTIVE" as const, docs: [] },
  ];

  const processorListings = [
    { sellerId: processor.id, marketplace: "PROCESSOR" as const, category: "BOXED_BEEF" as const, species: "CATTLE" as const, breed: "Angus — Boxed Primals", headCount: 40, avgWeightLbs: 60, priceType: "PER_POUND" as const, pricePerLbCents: 850, loadType: "FULL_LOAD" as const, tier: "REGISTERED" as const, description: "USDA Choice boxed beef primals and sub-primals, cryovac-packed, cut to spec. Grade-certified.", location: "Greeley, CO", zipCode: "80631", healthStatus: "USDA inspected", imageUrl: "/uploads/seed/boxed-beef.jpg", galleryUrls: ["/uploads/seed/boxed-beef.jpg"], status: "ACTIVE" as const },
    { sellerId: processor.id, marketplace: "PROCESSOR" as const, category: "GROUND_BEEF" as const, species: "CATTLE" as const, breed: "Angus — Ground, 80/20", headCount: 120, avgWeightLbs: 10, priceType: "PER_POUND" as const, pricePerLbCents: 450, loadType: "LTL" as const, tier: "COMMERCIAL" as const, description: "Fresh 80/20 ground Angus, 10 lb chubs. Batch-dated, HACCP facility.", location: "Greeley, CO", zipCode: "80631", healthStatus: "USDA inspected", imageUrl: "/uploads/seed/ground-beef.jpg", galleryUrls: ["/uploads/seed/ground-beef.jpg"], status: "ACTIVE" as const },
    { sellerId: processor.id, marketplace: "PROCESSOR" as const, category: "SAUSAGE" as const, species: "HOG" as const, breed: "Berkshire Sausage Links", headCount: 60, avgWeightLbs: 25, priceType: "PER_POUND" as const, pricePerLbCents: 680, loadType: "LTL" as const, tier: "REGISTERED" as const, description: "Heritage Berkshire breakfast links, 25 lb cases. Naturally smoked.", location: "Fayetteville, AR", zipCode: "72701", healthStatus: "USDA inspected", imageUrl: "/uploads/seed/sausage.jpg", galleryUrls: ["/uploads/seed/sausage.jpg"], status: "ACTIVE" as const },
  ];

  for (const data of listings) {
    const { docs: docEntries, ...listingData } = data;
    const created = await prisma.listing.create({ data: listingData });
    if (docEntries && docEntries.length > 0) {
      for (const d of docEntries) {
        await prisma.listingDocument.create({
          data: {
            listingId: created.id,
            kind: d.kind,
            fileName: d.fileName,
            url: "/uploads/seed/health-cert-angus.txt",
            mimeType: "text/plain",
            sizeBytes: 1472,
          },
        });
      }
    }
    console.log("Created:", data.breed);
  }
  for (const data of processorListings) {
    await prisma.listing.create({ data });
    console.log("Created [processor]:", data.breed);
  }
  await prisma.$disconnect();
  console.log("Seed complete");
}

seed().catch(console.error);
