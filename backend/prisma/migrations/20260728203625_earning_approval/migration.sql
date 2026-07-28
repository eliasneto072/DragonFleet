-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "earnings" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT,
ADD COLUMN     "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "earnings_status_idx" ON "earnings"("status");

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lançamentos anteriores à aprovação já eram tidos como válidos.
UPDATE "earnings" SET "status" = 'APPROVED';