-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];
