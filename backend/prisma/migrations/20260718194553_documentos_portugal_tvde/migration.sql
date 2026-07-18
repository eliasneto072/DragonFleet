/*
  Warnings:

  - The values [CNH,CRLV,RECIBO] on the enum `DocumentType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
ALTER TYPE "DocumentStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
BEGIN;
CREATE TYPE "DocumentType_new" AS ENUM ('CARTAO_CIDADAO', 'REGISTO_CRIMINAL', 'CARTA_CONDUCAO', 'CERTIFICADO_TVDE', 'FOTO_PERFIL', 'DUA', 'SEGURO_CARTA_VERDE', 'SEGURO_CONDICOES_ESPECIAIS', 'INSPECAO_PERIODICA', 'OTHER');
ALTER TABLE "documents" ALTER COLUMN "type" TYPE "DocumentType_new" USING ("type"::text::"DocumentType_new");
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";
DROP TYPE "public"."DocumentType_old";
COMMIT;

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'AGUARDANDO_REGULARIZACAO';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "issued_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "documents_status_expires_at_idx" ON "documents"("status", "expires_at");
