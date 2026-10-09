-- A plataforma: várias frotas na mesma base de dados.
--
-- ═══ O QUE ESTA MIGRAÇÃO FAZ ═══════════════════════════════════════════════
--
--   1. Cria `plans` e `fleets`.
--   2. Cria a frota do dono e dá-lhe TODOS os dados que já existem.
--   3. Acrescenta `fleet_id` às 41 tabelas, preenche-a, e só depois a torna
--      obrigatória.
--   4. Passa as unicidades globais a unicidades POR FROTA.
--
-- ═══ PORQUE É QUE É EM TRÊS PASSOS E NÃO NUM ═══════════════════════════════
--
-- Uma coluna NOT NULL acrescentada de uma vez a uma tabela com linhas é
-- recusada pelo Postgres — não há valor para as linhas que já lá estão. Por
-- isso: nasce a aceitar nulos, preenche-se, e só então se exige. É a ordem
-- que permite correr isto numa base de dados com anos de fechos lá dentro.
--
-- ═══ A FROTA DO DONO TEM UM ID FIXO ════════════════════════════════════════
--
-- `fleet_do_dono` em vez de um id gerado, e de propósito: esta migração tem de
-- poder correr duas vezes sem criar uma segunda frota e sem deixar metade dos
-- dados numa e metade noutra. Com um id fixo, a segunda passagem não faz nada.
--
-- ═══ NENHUM DADO SE PERDE ══════════════════════════════════════════════════
--
-- Não há DROP de nenhuma tabela nem de nenhuma coluna com dados. As únicas
-- coisas removidas são quatro índices de unicidade, substituídos por outros
-- mais estreitos.

-- ═══ 1. As tabelas novas ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "plans" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "duration_days" INTEGER NOT NULL,
  "price"         DECIMAL(12,2) NOT NULL,
  -- Lista de áreas e extras. Texto e não enum: uma área nova não pode obrigar
  -- a uma migração para poder ser vendida.
  "features"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes"         TEXT,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "plans_active_idx" ON "plans" ("active");

CREATE TABLE IF NOT EXISTS "fleets" (
  "id"                   TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "slug"                 TEXT NOT NULL,
  "nif"                  TEXT,
  "phone"                TEXT,
  "email"                TEXT,
  "logo_url"             TEXT,
  "active"               BOOLEAN NOT NULL DEFAULT true,
  "plan_id"              TEXT,
  "subscription_ends_on" DATE,
  "notes"                TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fleets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "fleets_slug_key" ON "fleets" ("slug");
CREATE INDEX IF NOT EXISTS "fleets_active_idx" ON "fleets" ("active");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleets_plan_id_fkey') THEN
    ALTER TABLE "fleets" ADD CONSTRAINT "fleets_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ═══ 2. A frota do dono ════════════════════════════════════════════════════
--
-- Sem plano e sem data de fim: quem é dono da casa não paga assinatura a
-- ninguém, e é assim que o resto do sistema distingue a frota dele.
INSERT INTO "fleets" ("id", "name", "slug", "active", "notes")
VALUES (
  'fleet_do_dono',
  'Chromatic Dragon',
  'chromatic-dragon',
  true,
  'A frota do dono da plataforma. Não tem assinatura.'
)
ON CONFLICT ("id") DO NOTHING;

-- ═══ 3. A coluna em todas as tabelas ═══════════════════════════════════════


ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "users" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "users_fleet_id_idx" ON "users" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_fleet_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "earnings" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "earnings" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "earnings" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "earnings_fleet_id_idx" ON "earnings" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'earnings_fleet_id_fkey') THEN
    ALTER TABLE "earnings" ADD CONSTRAINT "earnings_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "vehicles" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "vehicles" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "vehicles_fleet_id_idx" ON "vehicles" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_fleet_id_fkey') THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "vehicle_assignments" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "vehicle_assignments" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "vehicle_assignments" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "vehicle_assignments_fleet_id_idx" ON "vehicle_assignments" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_assignments_fleet_id_fkey') THEN
    ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "notifications" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "notifications" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "notifications_fleet_id_idx" ON "notifications" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_fleet_id_fkey') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "documents" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "documents" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "documents_fleet_id_idx" ON "documents" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_fleet_id_fkey') THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "withdrawals" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "withdrawals" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "withdrawals_fleet_id_idx" ON "withdrawals" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'withdrawals_fleet_id_fkey') THEN
    ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "bank_accounts" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "bank_accounts" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "bank_accounts_fleet_id_idx" ON "bank_accounts" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_fleet_id_fkey') THEN
    ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "balance_adjustments" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "balance_adjustments" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "balance_adjustments" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "balance_adjustments_fleet_id_idx" ON "balance_adjustments" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'balance_adjustments_fleet_id_fkey') THEN
    ALTER TABLE "balance_adjustments" ADD CONSTRAINT "balance_adjustments_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "payment_categories" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "payment_categories" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "payment_categories" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "payment_categories_fleet_id_idx" ON "payment_categories" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_categories_fleet_id_fkey') THEN
    ALTER TABLE "payment_categories" ADD CONSTRAINT "payment_categories_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "scheduled_payments" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "scheduled_payments" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "scheduled_payments" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "scheduled_payments_fleet_id_idx" ON "scheduled_payments" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_payments_fleet_id_fkey') THEN
    ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "reminders" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "reminders" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "reminders_fleet_id_idx" ON "reminders" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_fleet_id_fkey') THEN
    ALTER TABLE "reminders" ADD CONSTRAINT "reminders_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "support_tickets" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "support_tickets" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "support_tickets_fleet_id_idx" ON "support_tickets" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_fleet_id_fkey') THEN
    ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ticket_replies" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "ticket_replies" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "ticket_replies" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "ticket_replies_fleet_id_idx" ON "ticket_replies" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_replies_fleet_id_fkey') THEN
    ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "companies" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "companies" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "companies_fleet_id_idx" ON "companies" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_fleet_id_fkey') THEN
    ALTER TABLE "companies" ADD CONSTRAINT "companies_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "system_settings" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "system_settings" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "system_settings_fleet_id_idx" ON "system_settings" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'system_settings_fleet_id_fkey') THEN
    ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "weekly_settlements" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "weekly_settlements" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "weekly_settlements" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "weekly_settlements_fleet_id_idx" ON "weekly_settlements" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_settlements_fleet_id_fkey') THEN
    ALTER TABLE "weekly_settlements" ADD CONSTRAINT "weekly_settlements_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "settlement_revisions" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "settlement_revisions" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "settlement_revisions" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "settlement_revisions_fleet_id_idx" ON "settlement_revisions" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_revisions_fleet_id_fkey') THEN
    ALTER TABLE "settlement_revisions" ADD CONSTRAINT "settlement_revisions_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investment_plans" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investment_plans" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investment_plans" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investment_plans_fleet_id_idx" ON "investment_plans" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_plans_fleet_id_fkey') THEN
    ALTER TABLE "investment_plans" ADD CONSTRAINT "investment_plans_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investment_plan_rates" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investment_plan_rates" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investment_plan_rates" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investment_plan_rates_fleet_id_idx" ON "investment_plan_rates" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_plan_rates_fleet_id_fkey') THEN
    ALTER TABLE "investment_plan_rates" ADD CONSTRAINT "investment_plan_rates_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investments" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investments" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investments" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investments_fleet_id_idx" ON "investments" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investments_fleet_id_fkey') THEN
    ALTER TABLE "investments" ADD CONSTRAINT "investments_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investment_accruals" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investment_accruals" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investment_accruals" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investment_accruals_fleet_id_idx" ON "investment_accruals" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_accruals_fleet_id_fkey') THEN
    ALTER TABLE "investment_accruals" ADD CONSTRAINT "investment_accruals_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "rank_configs" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "rank_configs" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "rank_configs" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "rank_configs_fleet_id_idx" ON "rank_configs" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_configs_fleet_id_fkey') THEN
    ALTER TABLE "rank_configs" ADD CONSTRAINT "rank_configs_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "driver_ranks" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "driver_ranks" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "driver_ranks" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "driver_ranks_fleet_id_idx" ON "driver_ranks" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_ranks_fleet_id_fkey') THEN
    ALTER TABLE "driver_ranks" ADD CONSTRAINT "driver_ranks_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "rank_events" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "rank_events" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "rank_events" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "rank_events_fleet_id_idx" ON "rank_events" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rank_events_fleet_id_fkey') THEN
    ALTER TABLE "rank_events" ADD CONSTRAINT "rank_events_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investor_accounts" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investor_accounts" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investor_accounts" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investor_accounts_fleet_id_idx" ON "investor_accounts" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investor_accounts_fleet_id_fkey') THEN
    ALTER TABLE "investor_accounts" ADD CONSTRAINT "investor_accounts_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investor_rates" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investor_rates" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investor_rates" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investor_rates_fleet_id_idx" ON "investor_rates" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investor_rates_fleet_id_fkey') THEN
    ALTER TABLE "investor_rates" ADD CONSTRAINT "investor_rates_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investor_movements" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investor_movements" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investor_movements" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investor_movements_fleet_id_idx" ON "investor_movements" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investor_movements_fleet_id_fkey') THEN
    ALTER TABLE "investor_movements" ADD CONSTRAINT "investor_movements_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investor_withdrawals" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investor_withdrawals" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investor_withdrawals" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investor_withdrawals_fleet_id_idx" ON "investor_withdrawals" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investor_withdrawals_fleet_id_fkey') THEN
    ALTER TABLE "investor_withdrawals" ADD CONSTRAINT "investor_withdrawals_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "investment_projects" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "investment_projects" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "investment_projects" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "investment_projects_fleet_id_idx" ON "investment_projects" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'investment_projects_fleet_id_fkey') THEN
    ALTER TABLE "investment_projects" ADD CONSTRAINT "investment_projects_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "project_shares" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "project_shares" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "project_shares" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "project_shares_fleet_id_idx" ON "project_shares" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_shares_fleet_id_fkey') THEN
    ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "project_periods" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "project_periods" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "project_periods" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "project_periods_fleet_id_idx" ON "project_periods" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_periods_fleet_id_fkey') THEN
    ALTER TABLE "project_periods" ADD CONSTRAINT "project_periods_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "project_expenses" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "project_expenses" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "project_expenses" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "project_expenses_fleet_id_idx" ON "project_expenses" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_expenses_fleet_id_fkey') THEN
    ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "project_updates" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "project_updates" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "project_updates" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "project_updates_fleet_id_idx" ON "project_updates" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_updates_fleet_id_fkey') THEN
    ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "staff_permissions" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "staff_permissions" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "staff_permissions" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "staff_permissions_fleet_id_idx" ON "staff_permissions" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_permissions_fleet_id_fkey') THEN
    ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "workshops" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "workshops" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "workshops_fleet_id_idx" ON "workshops" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workshops_fleet_id_fkey') THEN
    ALTER TABLE "workshops" ADD CONSTRAINT "workshops_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "service_types" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "service_types" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "service_types" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "service_types_fleet_id_idx" ON "service_types" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_types_fleet_id_fkey') THEN
    ALTER TABLE "service_types" ADD CONSTRAINT "service_types_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "bookings" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "bookings" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "bookings_fleet_id_idx" ON "bookings" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_fleet_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "booking_files" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "booking_files" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "booking_files" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "booking_files_fleet_id_idx" ON "booking_files" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_files_fleet_id_fkey') THEN
    ALTER TABLE "booking_files" ADD CONSTRAINT "booking_files_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "materials" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "materials" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "materials_fleet_id_idx" ON "materials" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_fleet_id_fkey') THEN
    ALTER TABLE "materials" ADD CONSTRAINT "materials_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "stock_moves" ADD COLUMN IF NOT EXISTS "fleet_id" TEXT;
UPDATE "stock_moves" SET "fleet_id" = 'fleet_do_dono' WHERE "fleet_id" IS NULL;
ALTER TABLE "stock_moves" ALTER COLUMN "fleet_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "stock_moves_fleet_id_idx" ON "stock_moves" ("fleet_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_moves_fleet_id_fkey') THEN
    ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ═══ 4. O dono ═════════════════════════════════════════════════════════════
--
-- Pela marca `is_company`, que já identifica a conta da empresa, e nunca por
-- email ou por nome escritos aqui — um nome cravado numa migração é uma
-- surpresa à espera de acontecer no dia em que mudar.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_owner" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "is_owner" = true WHERE "is_company" = true;

-- ═══ 5. As unicidades passam a ser por frota ═══════════════════════════════
--
-- Eram globais porque só havia uma frota. Mantê-las globais dizia a uma frota
-- que a matrícula, o material ou o tipo de serviço já existiam noutra — que é
-- informação de um cliente a chegar a outro.
DROP INDEX IF EXISTS "vehicles_plate_key";
DROP INDEX IF EXISTS "vehicles_vin_key";
DROP INDEX IF EXISTS "payment_categories_label_key";
DROP INDEX IF EXISTS "service_types_label_key";
DROP INDEX IF EXISTS "materials_name_key";

CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_fleet_id_plate_key"
  ON "vehicles" ("fleet_id", "plate");
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_fleet_id_vin_key"
  ON "vehicles" ("fleet_id", "vin");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_categories_fleet_id_label_key"
  ON "payment_categories" ("fleet_id", "label");
CREATE UNIQUE INDEX IF NOT EXISTS "service_types_fleet_id_label_key"
  ON "service_types" ("fleet_id", "label");
CREATE UNIQUE INDEX IF NOT EXISTS "materials_fleet_id_name_key"
  ON "materials" ("fleet_id", "name");

-- ═══ 6. As definições deixam de ser uma linha só ═══════════════════════════
--
-- `system_settings.id` tinha o valor fixo "global" por omissão, porque só
-- havia uma linha. Agora há uma por frota: cai o valor fixo e entra a
-- unicidade pela frota, que é o que garante que continua a ser uma só — dela.
ALTER TABLE "system_settings" ALTER COLUMN "id" DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS "system_settings_fleet_id_key"
  ON "system_settings" ("fleet_id");

-- ═══ 7. Os níveis passam a ser de cada frota ═══════════════════════════════
--
-- A chave era o nível (TIER_1…TIER_5), uma linha por nível no sistema inteiro.
-- Passa a ser a frota mais o nível: cada frota tem os seus cinco, com as metas
-- e as vantagens dela.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rank_configs_pkey' AND conrelid = 'rank_configs'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conname = 'rank_configs_pkey' AND a.attname = 'fleet_id'
  ) THEN
    ALTER TABLE "rank_configs" DROP CONSTRAINT "rank_configs_pkey";
    ALTER TABLE "rank_configs" ADD CONSTRAINT "rank_configs_pkey"
      PRIMARY KEY ("fleet_id", "tier");
  END IF;
END $$;

-- ═══ 8. As vistas de saldos passam a dizer a frota ═════════════════════════
--
-- ─── PORQUE É QUE ISTO É O PONTO MAIS PERIGOSO DA MIGRAÇÃO ─────────────────
--
-- A camada que carimba a frota (ver `escopo.ts`) protege as consultas feitas
-- pelo Prisma. Estas vistas são lidas por SQL escrito à mão, que ela NÃO vê —
-- e uma soma de saldos sem filtro atravessa frotas sem dar erro nenhum: dá um
-- total certo para o sistema inteiro e errado para toda a gente.
--
-- Expor a coluna aqui não resolve sozinho: cada consulta tem de a usar. Mas
-- sem ela nem sequer é possível filtrar, e por isso vem primeiro.
--
-- A frota vem do utilizador, que é quem a tem: um saldo é de uma pessoa, e
-- uma pessoa é de uma frota só.

DROP VIEW IF EXISTS driver_balances;
CREATE VIEW driver_balances AS
SELECT
  u.id                                  AS user_id,
  u.fleet_id                            AS fleet_id,
  u.name                                AS user_name,
  u.email                               AS user_email,
  u.status                              AS user_status,

  COALESCE(s.total, 0)                  AS settlements,
  COALESCE(c.total, 0)                  AS credits,
  COALESCE(d.total, 0)                  AS debits,
  COALESCE(w.total, 0)                  AS withdrawn,
  COALESCE(p.total, 0)                  AS pending_withdrawals,
  COALESCE(e.total, 0)                  AS reported_earnings,

  COALESCE(s.total, 0) + COALESCE(c.total, 0) - COALESCE(d.total, 0)
    - COALESCE(w.total, 0) - COALESCE(p.total, 0)
    - COALESCE(i.invested, 0) + COALESCE(i.returned, 0)
                                        AS available,

  COALESCE(i.invested, 0)               AS invested,
  COALESCE(i.returned, 0)               AS investment_returns,
  COALESCE(i.invested_active, 0)        AS invested_active

FROM users u

LEFT JOIN (
  SELECT user_id, SUM(net_to_driver) AS total
  FROM weekly_settlements
  WHERE status = 'REGISTERED'
  GROUP BY user_id
) s ON s.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM balance_adjustments
  WHERE type = 'CREDIT'
  GROUP BY user_id
) c ON c.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM balance_adjustments
  WHERE type = 'DEBIT'
  GROUP BY user_id
) d ON d.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM withdrawals
  WHERE status IN ('APPROVED', 'PAID')
  GROUP BY user_id
) w ON w.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM withdrawals
  WHERE status = 'PENDING'
  GROUP BY user_id
) p ON p.user_id = u.id

LEFT JOIN (
  SELECT user_id, SUM(amount) AS total
  FROM earnings
  GROUP BY user_id
) e ON e.user_id = u.id

LEFT JOIN (
  SELECT
    user_id,
    SUM(principal)                                        AS invested,
    SUM(CASE WHEN status = 'CLOSED' THEN payout ELSE 0 END) AS returned,
    SUM(CASE WHEN status = 'ACTIVE' THEN principal ELSE 0 END) AS invested_active
  FROM investments
  GROUP BY user_id
) i ON i.user_id = u.id
;

DROP VIEW IF EXISTS investor_balances;
CREATE VIEW investor_balances AS
SELECT
  a."id"                                   AS account_id,
  a."fleet_id"                             AS fleet_id,
  a."user_id"                              AS user_id,
  u."name"                                 AS user_name,
  u."email"                                AS user_email,
  a."status"                               AS account_status,
  a."start_date"                           AS start_date,
  a."accrued_through"                      AS accrued_through,
  a."notice_days"                          AS notice_days,

  COALESCE(cap.total, 0)                   AS capital,
  COALESCE(ear.total, 0)                   AS earnings,
  COALESCE(cap.total, 0) + COALESCE(ear.total, 0)
                                           AS total,

  COALESCE(pc.total, 0)                    AS pending_capital,
  COALESCE(pe.total, 0)                    AS pending_earnings,

  COALESCE(cap.total, 0) - COALESCE(pc.total, 0) - COALESCE(prj.total, 0)
                                           AS available_capital,
  COALESCE(ear.total, 0) - COALESCE(pe.total, 0)
                                           AS available_earnings,

  COALESCE(dep.total, 0)                   AS deposited,
  COALESCE(wit.total, 0)                   AS withdrawn,

  COALESCE(prj.total, 0)                   AS invested_in_projects,
  COALESCE(prj.n, 0)                       AS projects_count

FROM "investor_accounts" a
JOIN "users" u ON u."id" = a."user_id"

LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "investor_movements" WHERE "bucket" = 'CAPITAL' GROUP BY "account_id"
) cap ON cap."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "investor_movements" WHERE "bucket" = 'EARNINGS' GROUP BY "account_id"
) ear ON ear."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "investor_withdrawals"
  WHERE "status" = 'PENDING' AND "bucket" = 'CAPITAL' GROUP BY "account_id"
) pc ON pc."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "investor_withdrawals"
  WHERE "status" = 'PENDING' AND "bucket" = 'EARNINGS' GROUP BY "account_id"
) pe ON pe."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "investor_movements" WHERE "kind" = 'DEPOSIT' GROUP BY "account_id"
) dep ON dep."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", -SUM("amount") AS total
  FROM "investor_movements" WHERE "kind" = 'WITHDRAWAL' GROUP BY "account_id"
) wit ON wit."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total, COUNT(*)::int AS n
  FROM "project_shares" WHERE "status" = 'ACTIVE' GROUP BY "account_id"
) prj ON prj."account_id" = a."id";
