-- CreateEnum
CREATE TYPE "ListingDocumentKind" AS ENUM ('HEALTH_CERT', 'VET_RECORD', 'SCALE_TICKET', 'REGISTRATION', 'PROOF_OF_ORIGIN', 'OTHER');

-- CreateTable
CREATE TABLE "ListingDocument" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "ListingDocumentKind" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingDocument_listingId_idx" ON "ListingDocument"("listingId");

-- AddForeignKey
ALTER TABLE "ListingDocument" ADD CONSTRAINT "ListingDocument_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
