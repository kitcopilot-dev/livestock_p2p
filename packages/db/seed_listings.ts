import { prisma } from "./src/index.js";

async function seed() {
  const seller = await prisma.user.findFirst({ where: { role: "SELLER" } });
  if (!seller) { console.log("No seller user found"); return; }
  const hauler = await prisma.user.upsert({
    where: { email: "demo.hauler@livestock.local" },
    create: { email: "demo.hauler@livestock.local", name: "Hal Hauler", role: "HAULER", kycStatus: "APPROVED" },
    update: {},
  });

  // Historical trips for the demo hauler so the load-board hero shows
  // meaningful trip stats: miles hauled, loads completed, on-time rate.
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const history = [
    { origin: "Greeley, CO", destination: "Denver, CO", distanceMiles: 85, freightPayCents: 78000, headCount: 90, totalWeightLbs: 112500, acceptedAt: new Date(now - 21 * day), completedAt: new Date(now - 20 * day + 4 * 3600 * 1000), dueAt: new Date(now - 20 * day + 6 * 3600 * 1000) },
    { origin: "Amarillo, TX", destination: "Lubbock, TX", distanceMiles: 120, freightPayCents: 115000, headCount: 85, totalWeightLbs: 100300, acceptedAt: new Date(now - 14 * day), completedAt: new Date(now - 13 * day + 5 * 3600 * 1000), dueAt: new Date(now - 13 * day + 7 * 3600 * 1000) },
    { origin: "Oklahoma City, OK", destination: "Tulsa, OK", distanceMiles: 105, freightPayCents: 99000, headCount: 120, totalWeightLbs: 150000, acceptedAt: new Date(now - 9 * day), completedAt: new Date(now - 8 * day + 3 * 3600 * 1000), dueAt: new Date(now - 8 * day + 8 * 3600 * 1000) },
    { origin: "Fayetteville, AR", destination: "Memphis, TN", distanceMiles: 230, freightPayCents: 210000, headCount: 200, totalWeightLbs: 56000, acceptedAt: new Date(now - 5 * day), completedAt: new Date(now - 4 * day + 8 * 3600 * 1000), dueAt: new Date(now - 4 * day + 7 * 3600 * 1000) },
    { origin: "Wichita, KS", destination: "Kansas City, MO", distanceMiles: 190, freightPayCents: 174000, headCount: 95, totalWeightLbs: 128250, acceptedAt: new Date(now - 2 * day), completedAt: new Date(now - 1 * day + 6 * 3600 * 1000), dueAt: new Date(now - 1 * day + 9 * 3600 * 1000) },
  ];
  for (const h of history) {
    const existingLoad = await prisma.load.findFirst({ where: { origin: h.origin, destination: h.destination, haulerId: hauler.id } });
    if (!existingLoad) {
      await prisma.load.create({ data: { ...h, species: "CATTLE", loadType: "FULL_LOAD", marketplace: "LIVE", haulerId: hauler.id, posterId: seller.id, status: "COMPLETED", paidAt: h.completedAt } });
    }
  }
  // Randy Rig — second demo hauler
  const rig = await prisma.user.upsert({
    where: { email: "demo.rig@livestock.local" },
    create: { email: "demo.rig@livestock.local", name: "Randy Rig", role: "HAULER", kycStatus: "APPROVED" },
    update: {},
  });
  const randyHistory = [
    { origin: "Sioux Falls, SD", destination: "Omaha, NE", distanceMiles: 180, freightPayCents: 62000, headCount: 75, totalWeightLbs: 97500, acceptedAt: new Date(now - 18 * day), completedAt: new Date(now - 17 * day + 2 * 3600 * 1000), dueAt: new Date(now - 17 * day + 5 * 3600 * 1000) },
    { origin: "Des Moines, IA", destination: "Chicago, IL", distanceMiles: 330, freightPayCents: 350000, headCount: 110, totalWeightLbs: 132000, acceptedAt: new Date(now - 10 * day), completedAt: new Date(now - 9 * day + 4 * 3600 * 1000), dueAt: new Date(now - 9 * day + 6 * 3600 * 1000) },
    { origin: "Billings, MT", destination: "Rapid City, SD", distanceMiles: 320, freightPayCents: 280000, headCount: 80, totalWeightLbs: 96000, acceptedAt: new Date(now - 7 * day), completedAt: new Date(now - 6 * day + 10 * 3600 * 1000), dueAt: new Date(now - 6 * day + 5 * 3600 * 1000) },
  ];
  for (const h of randyHistory) {
    const existingLoad = await prisma.load.findFirst({ where: { origin: h.origin, destination: h.destination, haulerId: rig.id } });
    if (!existingLoad) {
      await prisma.load.create({ data: { ...h, species: "CATTLE", loadType: "FULL_LOAD", marketplace: "LIVE", haulerId: rig.id, posterId: seller.id, status: "COMPLETED", paidAt: h.completedAt } });
    }
  }



  const listings = [
    { sellerId: seller.id, species: "CATTLE" as const, breed: "Angus", headCount: 120, avgWeightLbs: 1250, priceType: "PER_POUND" as const, pricePerLbCents: 245, loadType: "FULL_LOAD" as const, tier: "COMMERCIAL" as const, description: "Premium Angus steers, grain-fed 150 days. USDA Choice. Pre-conditioned.", location: "Oklahoma City, OK", zipCode: "73102", gender: "STEER" as const, ageRange: "12-16 months", healthStatus: "Healthy, USDA inspected", origin: "Oklahoma City, OK", registry: "None", listingClass: "Steers", husbandry: "Grain-fed (150 days)", frame: "Large", vaccines: "7-way blackleg, IBR/BVD/PI3/BRSV", condition: "BCS 5.5", fertility: "N/A", registryType: "Commercial", birthWeightLbs: 82, status: "ACTIVE" as const },
    { sellerId: seller.id, species: "CATTLE" as const, breed: "Hereford", headCount: 85, avgWeightLbs: 1180, priceType: "PER_HEAD" as const, pricePerLbCents: 225, pricePerHeadCents: 265000, loadType: "LTL" as const, tier: "REGISTERED" as const, description: "Hereford heifers, range-raised on native grass.", location: "Amarillo, TX", zipCode: "79101", gender: "HEIFER" as const, ageRange: "14-18 months", healthStatus: "Healthy, vaccinated", origin: "Amarillo, TX", registry: "American Hereford Association", listingClass: "Heifers", husbandry: "Grass-fed, range-raised", frame: "Medium", vaccines: "5-way lepto, 7-way blackleg", condition: "BCS 5", fertility: "Exposed to registered bull", registryType: "Registered", birthWeightLbs: 78, status: "ACTIVE" as const },
    { sellerId: seller.id, species: "HOG" as const, breed: "Berkshire (Kurobuta)", headCount: 200, avgWeightLbs: 280, priceType: "PER_HEAD" as const, pricePerLbCents: 320, pricePerHeadCents: 89600, loadType: "LTL" as const, tier: "COMMERCIAL" as const, description: "Heritage Berkshire hogs, pasture-raised, antibiotic-free.", location: "Fayetteville, AR", zipCode: "72701", gender: "BARROW" as const, ageRange: "6-8 months", healthStatus: "Antibiotic-free, pastured", origin: "Fayetteville, AR", registry: "None", listingClass: "Barrows", husbandry: "Pasture-raised, antibiotic-free", frame: "Medium", vaccines: "PCV2, Mycoplasma", condition: "BCS 3", fertility: "N/A", registryType: "Commercial", birthWeightLbs: 3, status: "ACTIVE" as const },
    { sellerId: seller.id, species: "SHEEP" as const, breed: "Dorper", headCount: 150, avgWeightLbs: 135, priceType: "PER_POUND" as const, pricePerLbCents: 410, loadType: "FULL_LOAD" as const, tier: "REGISTERED" as const, description: "Dorper sheep, hair breed. Excellent carcass yield.", location: "Memphis, TN", zipCode: "38101", gender: "WETHER" as const, ageRange: "8-12 months", healthStatus: "Healthy, dewormed", origin: "Memphis, TN", registry: "American Dorper Sheep Association", listingClass: "Wethers", husbandry: "Pasture-raised", frame: "Medium", vaccines: "CD/T, Ovine progressive pneumonia", condition: "BCS 4", fertility: "N/A", registryType: "Registered", birthWeightLbs: 8, status: "ACTIVE" as const },
    { sellerId: seller.id, species: "GOAT" as const, breed: "Boer", headCount: 100, avgWeightLbs: 80, priceType: "PER_HEAD" as const, pricePerLbCents: 380, pricePerHeadCents: 30400, loadType: "LTL" as const, tier: "COMMERCIAL" as const, description: "Boer goats, premier meat goat breed.", location: "Nashville, TN", zipCode: "37201", gender: "MIX" as const, ageRange: "4-6 months", healthStatus: "Healthy, CDT vaccinated", origin: "Nashville, TN", registry: "None", listingClass: "Kids", husbandry: "Pasture-raised", frame: "Medium", vaccines: "CD/T", condition: "BCS 4", fertility: "N/A", registryType: "Commercial", birthWeightLbs: 7, status: "ACTIVE" as const },
    { sellerId: seller.id, species: "CATTLE" as const, breed: "Charolais", headCount: 95, avgWeightLbs: 1350, priceType: "PER_POUND" as const, pricePerLbCents: 238, loadType: "FULL_LOAD" as const, tier: "REGISTERED" as const, description: "Charolais bulls and steers, heavy muscled. AI-sired.", location: "Wichita, KS", zipCode: "67201", gender: "BULL" as const, ageRange: "18-22 months", healthStatus: "Healthy, BSE examined", origin: "Wichita, KS", registry: "American-International Charolais Association", listingClass: "Bulls", husbandry: "Grain-fed, performance-tested", frame: "Large", vaccines: "7-way blackleg, BVD-PI3", condition: "BCS 6", fertility: "Breeding soundness examined", registryType: "Registered", birthWeightLbs: 90, status: "ACTIVE" as const },
  ];

  for (const data of listings) {
    const existing = await prisma.listing.findFirst({ where: { sellerId: seller.id, breed: data.breed } });
    if (!existing) {
      await prisma.listing.create({ data });
      console.log("Created:", data.breed);
    } else {
      console.log("Exists:", data.breed);
    }
  }
  await prisma.$disconnect();
  console.log("Seed complete");
}

seed().catch(console.error);
