-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('LIVE', 'PROCESSOR');

-- CreateEnum
CREATE TYPE "ProcessorCategory" AS ENUM ('BOXED_BEEF', 'CARCASS', 'GROUND_BEEF', 'JERKY', 'SAUSAGE', 'DAIRY', 'OTHER');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "category" "ProcessorCategory",
ADD COLUMN     "marketplace" "Marketplace" NOT NULL DEFAULT 'LIVE';

-- CreateTable
CREATE TABLE "Load" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "distanceMiles" INTEGER,
    "loadType" "LoadType" NOT NULL,
    "species" "Species" NOT NULL,
    "headCount" INTEGER NOT NULL,
    "totalWeightLbs" INTEGER NOT NULL,
    "freightPayCents" INTEGER NOT NULL,
    "status" "LoadStatus" NOT NULL DEFAULT 'OPEN',
    "haulerId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Load_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Load_escrowId_key" ON "Load"("escrowId");

-- CreateIndex
CREATE INDEX "Load_status_idx" ON "Load"("status");

-- CreateIndex
CREATE INDEX "Load_haulerId_idx" ON "Load"("haulerId");

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_haulerId_fkey" FOREIGN KEY ("haulerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
