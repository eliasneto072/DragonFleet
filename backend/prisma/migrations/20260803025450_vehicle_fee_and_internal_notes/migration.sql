-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "weekly_fee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "weekly_settlements" ADD COLUMN     "internal_notes" TEXT;
