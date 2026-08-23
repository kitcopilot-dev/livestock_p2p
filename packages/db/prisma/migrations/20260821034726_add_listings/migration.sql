-- CreateEnum
CREATE TYPE "Species" AS ENUM ('CATTLE', 'HOG', 'SHEEP', 'GOAT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'EXPIRED', 'DRAFT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('STEER', 'HEIFER', 'BULL', 'BARROW', 'GILT', 'WETHER', 'EWE', 'RAM', 'MIX');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT NOT NULL,
    "headCount" INTEGER NOT NULL,
    "avgWeightLbs" INTEGER NOT NULL,
    "pricePerLbCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "zipCode" TEXT,
    "gender" "Gender",
    "ageRange" TEXT,
    "healthStatus" TEXT,
    "imageUrl" TEXT,
    "galleryUrls" TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_status_species_idx" ON "Listing"("status", "species");

-- CreateIndex
CREATE INDEX "Listing_status_location_idx" ON "Listing"("status", "location");

-- CreateIndex
CREATE INDEX "Listing_sellerId_idx" ON "Listing"("sellerId");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
