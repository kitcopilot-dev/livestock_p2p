-- AlterTable
ALTER TABLE "Load" ADD COLUMN     "posterId" TEXT,
ALTER COLUMN "escrowId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Load" ADD CONSTRAINT "Load_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
