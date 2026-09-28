-- Despesas importadas dos portais (Prio e Via Verde) e cartões de combustível.
--
-- Escrita à mão, com as convenções exatas que o Prisma gera — o ambiente onde
-- foi escrita não conseguia correr o prisma migrate. O script de aplicação
-- corre `prisma migrate diff` no fim para confirmar que a base ficou igual ao
-- schema; se não ficasse, recusava.

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('PRIO', 'VIA_VERDE');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FUEL', 'TOLL', 'PARKING', 'FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseMatch" AS ENUM ('CARD', 'PLATE', 'MANUAL');

-- CreateTable
CREATE TABLE "fuel_cards" (
    "id" TEXT NOT NULL,
    "provider" "ExpenseSource" NOT NULL DEFAULT 'PRIO',
    "number" TEXT NOT NULL,
    "label" TEXT,
    "user_id" TEXT,
    "vehicle_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_movements" (
    "id" TEXT NOT NULL,
    "source" "ExpenseSource" NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "day" DATE NOT NULL,
    "settlement_week" DATE NOT NULL,
    "plate" TEXT,
    "card_number" TEXT,
    "identifier" TEXT,
    "receipt" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status_text" TEXT,
    "chargeable" BOOLEAN NOT NULL,
    "user_id" TEXT,
    "matched_by" "ExpenseMatch",
    "vehicle_id" TEXT,
    "external_key" TEXT NOT NULL,
    "imported_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fuel_cards_provider_number_key" ON "fuel_cards"("provider", "number");

-- CreateIndex
CREATE INDEX "expense_movements_user_id_settlement_week_idx" ON "expense_movements"("user_id", "settlement_week");

-- CreateIndex
CREATE INDEX "expense_movements_settlement_week_idx" ON "expense_movements"("settlement_week");

-- CreateIndex
CREATE UNIQUE INDEX "expense_movements_source_external_key_key" ON "expense_movements"("source", "external_key");

-- AddForeignKey
ALTER TABLE "fuel_cards" ADD CONSTRAINT "fuel_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_cards" ADD CONSTRAINT "fuel_cards_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_movements" ADD CONSTRAINT "expense_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Um cartão pertence a um motorista OU a um veículo, nunca aos dois. O Prisma
-- não sabe exprimir isto; a base sabe, e é aqui que a regra fica garantida
-- mesmo que um dia alguém escreva direto na base.
ALTER TABLE "fuel_cards" ADD CONSTRAINT "fuel_cards_one_owner_check"
  CHECK (NOT ("user_id" IS NOT NULL AND "vehicle_id" IS NOT NULL));
