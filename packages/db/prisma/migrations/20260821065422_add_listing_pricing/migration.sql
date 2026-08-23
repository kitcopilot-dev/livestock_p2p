-- CreateEnum
CREATE TYPE "ListingPriceType" AS ENUM ('PER_POUND', 'PER_HEAD');

-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('FULL_LOAD', 'LTL');

-- CreateEnum
CREATE TYPE "ListingTier" AS ENUM ('COMMERCIAL', 'REGISTERED');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "loadType" "LoadType" NOT NULL DEFAULT 'FULL_LOAD',
ADD COLUMN     "pricePerHeadCents" INTEGER,
ADD COLUMN     "priceType" "ListingPriceType" NOT NULL DEFAULT 'PER_POUND',
ADD COLUMN     "tier" "ListingTier" NOT NULL DEFAULT 'COMMERCIAL';
