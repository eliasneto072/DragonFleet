-- Ranks: cinco níveis, metas por temporada de dois meses, e trinta dias de
-- proteção depois de cada temporada. Ver o bloco "RANKS" no schema.prisma.
--
-- As cinco linhas de configuração são criadas aqui com valores de arranque, e
-- não pelo código: assim o painel abre já com os níveis para editar, e uma base
-- nova (ou a de testes) nasce no mesmo estado da de produção.
--
-- As metas nascem a ZERO de propósito. Zero significa "não conta", portanto
-- ninguém sobe por engano no dia em que isto entrar: o Diogo define os valores
-- no painel e só aí o sistema começa a mexer.

-- CreateEnum
CREATE TYPE "RankTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5');

-- CreateEnum
CREATE TYPE "RankEventKind" AS ENUM ('UP', 'DOWN', 'SEASON_END', 'FLOOR_EXPIRED');

-- CreateTable
CREATE TABLE "rank_configs" (
    "tier" "RankTier" NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "min_season_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_invested" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_weeks" INTEGER NOT NULL DEFAULT 0,
    "require_valid_documents" BOOLEAN NOT NULL DEFAULT true,
    "fuel_discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vehicle_discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tolls_discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "investment_rate_bonus" DECIMAL(5,3) NOT NULL DEFAULT 0,
    "perks" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rank_configs_pkey" PRIMARY KEY ("tier")
);

-- CreateTable
CREATE TABLE "driver_ranks" (
    "user_id" TEXT NOT NULL,
    "tier" "RankTier" NOT NULL DEFAULT 'TIER_1',
    "earned_tier" "RankTier" NOT NULL DEFAULT 'TIER_1',
    "floor_tier" "RankTier",
    "floor_until" DATE,
    "season_start" DATE NOT NULL,
    "season_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invested" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "weeks" INTEGER NOT NULL DEFAULT 0,
    "documents_ok" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_ranks_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "rank_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "RankEventKind" NOT NULL,
    "tier" "RankTier" NOT NULL,
    "from_tier" "RankTier",
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_ranks_tier_idx" ON "driver_ranks"("tier");

-- CreateIndex
CREATE INDEX "rank_events_user_id_idx" ON "rank_events"("user_id");

-- AddForeignKey
ALTER TABLE "driver_ranks" ADD CONSTRAINT "driver_ranks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_events" ADD CONSTRAINT "rank_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: planos de investimento podem exigir um rank mínimo.
ALTER TABLE "investment_plans" ADD COLUMN "min_rank" "RankTier";

-- Os cinco níveis, com os nomes e as cores de arranque.
INSERT INTO "rank_configs" ("tier", "label", "color", "updated_at") VALUES
  ('TIER_1', 'Dragon Driver',  '#64748B', NOW()),
  ('TIER_2', 'Dragon Elite',   '#2563EB', NOW()),
  ('TIER_3', 'Dragon Leader',  '#0D6B4F', NOW()),
  ('TIER_4', 'Dragon Manager', '#B45309', NOW()),
  ('TIER_5', 'Dragon Master',  '#7C3AED', NOW());
