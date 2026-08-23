-- CreateEnum
CREATE TYPE "LoadBidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "LoadBid" (
    "id" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "haulerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "LoadBidStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoadBid_loadId_status_idx" ON "LoadBid"("loadId", "status");

-- CreateIndex
CREATE INDEX "LoadBid_haulerId_idx" ON "LoadBid"("haulerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadBid_loadId_haulerId_key" ON "LoadBid"("loadId", "haulerId");

-- AddForeignKey
ALTER TABLE "LoadBid" ADD CONSTRAINT "LoadBid_loadId_fkey" FOREIGN KEY ("loadId") REFERENCES "Load"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadBid" ADD CONSTRAINT "LoadBid_haulerId_fkey" FOREIGN KEY ("haulerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
