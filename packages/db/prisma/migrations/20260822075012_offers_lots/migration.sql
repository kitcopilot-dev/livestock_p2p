-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CONFIRMED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfferPriceType" AS ENUM ('PER_HEAD', 'PER_POUND');

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'UNDER_OFFER';

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priceType" "OfferPriceType" NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "message" TEXT,
    "transportNeeded" BOOLEAN NOT NULL DEFAULT false,
    "destinationFacility" TEXT,
    "sellerApprovedAt" TIMESTAMP(3),
    "buyerConfirmedAt" TIMESTAMP(3),
    "declinedReason" TEXT,
    "escrowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_reference_key" ON "Offer"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_escrowId_key" ON "Offer"("escrowId");

-- CreateIndex
CREATE INDEX "Offer_buyerId_status_idx" ON "Offer"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Offer_sellerId_status_idx" ON "Offer"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Offer_status_createdAt_idx" ON "Offer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OfferItem_listingId_idx" ON "OfferItem"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferItem_offerId_listingId_key" ON "OfferItem"("offerId", "listingId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "EscrowTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
