/*
  Warnings:

  - Changed the type of `platform` on the `earnings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "EarningPlatform" AS ENUM ('UBER', 'BOLT', 'FREE_NOW', 'OTHER');

-- AlterTable
ALTER TABLE "earnings" DROP COLUMN "platform",
ADD COLUMN     "platform" "EarningPlatform" NOT NULL;
