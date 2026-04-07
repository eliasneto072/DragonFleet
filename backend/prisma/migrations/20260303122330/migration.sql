/*
  Warnings:

  - Added the required column `brand` to the `vehicles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `vehicles` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'SOLD');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "brand" TEXT NOT NULL,
ADD COLUMN     "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");
