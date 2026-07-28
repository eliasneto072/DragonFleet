-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'REGISTERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "weekly_settlements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "uber_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bolt_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tolls_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fuel_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vehicle_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "gross_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profit_base" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_to_driver" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_settlements_user_id_idx" ON "weekly_settlements"("user_id");

-- CreateIndex
CREATE INDEX "weekly_settlements_week_start_idx" ON "weekly_settlements"("week_start");

-- CreateIndex
CREATE INDEX "weekly_settlements_status_idx" ON "weekly_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_settlements_user_id_week_start_key" ON "weekly_settlements"("user_id", "week_start");

-- AddForeignKey
ALTER TABLE "weekly_settlements" ADD CONSTRAINT "weekly_settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_settlements" ADD CONSTRAINT "weekly_settlements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_settlements" ADD CONSTRAINT "weekly_settlements_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
