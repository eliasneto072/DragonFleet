/*
  Warnings:

  - Added the required column `file_key` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "file_key" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT;
