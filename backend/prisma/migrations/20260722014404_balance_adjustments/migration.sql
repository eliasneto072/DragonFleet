-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "balance_adjustments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_adjustments_user_id_idx" ON "balance_adjustments"("user_id");

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
