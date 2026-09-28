-- Investimentos: planos, aplicações e ganhos diários.
--
-- Ver o bloco "INVESTIMENTOS" no schema.prisma para o modelo. Esta migração
-- faz duas coisas: cria as tabelas e ALTERA A VIEW `driver_balances`, porque
-- aplicar tira dinheiro do saldo principal e resgatar devolve-o. A view é a
-- única definição do saldo (ver add_driver_balances_view); se a regra vivesse
-- noutro sítio, o saldo que o motorista vê e o que a retirada verifica podiam
-- discordar.

-- CreateEnum
CREATE TYPE "InvestmentPlanType" AS ENUM ('FIXED', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "InvestmentCloseReason" AS ENUM ('MATURED', 'EARLY', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "investment_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "InvestmentPlanType" NOT NULL,
    "annual_rate" DECIMAL(6,3) NOT NULL,
    "term_days" INTEGER,
    "early_withdrawal_penalty" DECIMAL(5,2),
    "min_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_plan_rates" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "annual_rate" DECIMAL(6,3) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_plan_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "plan_type" "InvestmentPlanType" NOT NULL,
    "annual_rate" DECIMAL(6,3),
    "term_days" INTEGER,
    "penalty_rate" DECIMAL(5,2),
    "start_date" DATE NOT NULL,
    "maturity_date" DATE,
    "accrued_through" DATE,
    "accrued" DECIMAL(16,6) NOT NULL DEFAULT 0,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "close_reason" "InvestmentCloseReason",
    "payout" DECIMAL(12,2),
    "penalty_amount" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_accruals" (
    "id" TEXT NOT NULL,
    "investment_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "annual_rate" DECIMAL(6,3) NOT NULL,
    "amount" DECIMAL(16,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_plan_rates_plan_id_effective_from_key" ON "investment_plan_rates"("plan_id", "effective_from");

-- CreateIndex
CREATE INDEX "investments_user_id_idx" ON "investments"("user_id");

-- CreateIndex
CREATE INDEX "investments_status_idx" ON "investments"("status");

-- CreateIndex
CREATE INDEX "investments_plan_id_idx" ON "investments"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "investment_accruals_investment_id_day_key" ON "investment_accruals"("investment_id", "day");

-- AddForeignKey
ALTER TABLE "investment_plan_rates" ADD CONSTRAINT "investment_plan_rates_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "investment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "investment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_accruals" ADD CONSTRAINT "investment_accruals_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── O saldo passa a contar os investimentos ────────────────────────────────
--
-- Duas colunas novas, acrescentadas NO FIM: o CREATE OR REPLACE VIEW do
-- Postgres só aceita colunas novas depois das existentes, e quem lê a view por
-- nome não dá pela diferença.
--
--   invested            soma de TODOS os valores aplicados (ativos e fechados)
--   investment_returns  soma do que voltou ao saldo nos resgates
--
-- As duas juntas dão o efeito líquido: uma aplicação ativa conta só como saída;
-- uma fechada conta como saída do principal e entrada do payout, e a diferença
-- é o ganho (ou a perda, com penalização). Contar só as ativas daria o mesmo
-- disponível, mas a coluna deixava de explicar para onde foi o dinheiro.
--
-- `invested_active` é informativo: o que está trancado neste momento.

CREATE OR REPLACE VIEW driver_balances AS
SELECT
  u.id                                  AS user_id,
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
