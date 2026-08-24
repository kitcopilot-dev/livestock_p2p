-- Link a sale-derived load back to its listing so a lapsed/cancelled escrow
-- can release the listing back to ACTIVE instead of stranding it as SOLD.
ALTER TABLE "Load" ADD COLUMN IF NOT EXISTS "listingId" TEXT;

ALTER TABLE "Load"
  ADD CONSTRAINT "Load_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Load_listingId_idx" ON "Load"("listingId");
