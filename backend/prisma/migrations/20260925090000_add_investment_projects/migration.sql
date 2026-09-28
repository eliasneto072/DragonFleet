-- Projetos de investimento: participação nos lucros de um carro.
--
-- ─── O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────────
--
-- Não é um depósito com juro. É dinheiro que financia um ativo concreto — um
-- carro — e que recebe uma percentagem do que esse carro der, todos os meses,
-- enquanto ele rodar.
--
-- A diferença que muda tudo: **as distribuições mensais NÃO amortizam o
-- capital**. Quem pôs 10 000 € continua com 10 000 € em dívida depois de já
-- ter recebido 10 000 € de lucros. O capital só volta quando o carro for
-- vendido (ou quando o prazo do projeto acabar, se tiver prazo).
--
-- Foi uma decisão explícita do cliente e é o que faz o investidor continuar a
-- ganhar enquanto o carro rodar. Está escrito aqui porque quem ler este
-- ficheiro daqui a dois anos vai assumir o contrário — toda a gente assume.
--
-- ─── COMO SE APURA O LUCRO ──────────────────────────────────────────────────
--
-- Do que já está na base. Um projeto aponta para um veículo; o lucro de um mês
-- é o que esse veículo rendeu à empresa nos fechos semanais REGISTADOS desse
-- mês — a comissão e o aluguer da viatura — menos as despesas que não passam
-- pelo fecho (seguro, revisão, pneus), lançadas à mão.
--
-- Combustível e portagens não entram: são adiantados pela empresa e
-- descontados ao motorista no mesmo fecho, portanto o efeito é nulo.
--
-- Fica tudo guardado por mês em `project_periods`, com as parcelas à vista:
-- sem isso, um investidor que pergunte "de onde vem este valor" não tem
-- resposta, e é a primeira pergunta que ele faz.
--
-- ─── A REPARTIÇÃO ───────────────────────────────────────────────────────────
--
-- `profit_share` é a fatia do lucro que vai para os investidores (50 = 50%).
-- Dentro dessa fatia, cada um recebe na proporção do que pôs. Os cêntimos que
-- sobram da divisão são atribuídos pelo método do maior resto, no serviço: sem
-- isso, dividir 100 € por três perde um cêntimo por mês, todos os meses.

-- ═══════════════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM (
    'DRAFT',      -- a preparar; os investidores não o veem
    'FUNDING',    -- aberto a subscrições
    'ACTIVE',     -- financiado, o carro a render
    'CLOSED',     -- liquidado: capital devolvido
    'CANCELLED'   -- abortado antes de arrancar; capital libertado
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectShareStatus" AS ENUM (
    'ACTIVE',     -- a participar e a receber
    'LIQUIDATED', -- o projeto fechou e o capital voltou
    'CANCELLED'   -- o projeto foi abortado
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProjectPeriodStatus" AS ENUM (
    'DRAFT',        -- apurado, ainda não pago
    'DISTRIBUTED'   -- pago aos investidores
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O projeto
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "investment_projects" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,

  -- Quanto é preciso angariar.
  "target_amount" DECIMAL(12,2) NOT NULL,
  -- Valor mínimo por participação. Zero = sem mínimo.
  "min_ticket"    DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- A fatia do lucro que vai para os investidores, em percentagem.
  "profit_share"  DECIMAL(5,2) NOT NULL DEFAULT 50,

  -- O carro. Nulo enquanto não estiver escolhido — um projeto pode ser aberto
  -- a angariar antes de a viatura existir na frota.
  --
  -- SET NULL: dar baixa de um veículo não pode apagar o projeto que o
  -- financiou, nem o histórico de lucros já distribuídos.
  "vehicle_id"    TEXT,

  -- Que parcelas do fecho contam como rendimento do carro. Editáveis porque
  -- são uma decisão de negócio e não uma verdade universal — e porque baixar
  -- isto ao código obrigaria a um deploy para mudar de ideias.
  "include_commission"  BOOLEAN NOT NULL DEFAULT true,
  "include_vehicle_fee" BOOLEAN NOT NULL DEFAULT true,

  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',

  -- Datas do ciclo de vida.
  "funding_closes_on" DATE,
  "started_on"        DATE,   -- primeiro mês que conta lucro
  -- Prazo OPCIONAL. Vazio = corre até o carro ser vendido. Preenchido = o
  -- capital é devolvido nessa data mesmo sem venda. Existe porque um carro que
  -- dure seis anos devolveria o capital mais de três vezes em distribuições, e
  -- convém haver forma de fechar isso sem ter de vender.
  "ends_on"           DATE,
  "closed_on"         DATE,

  -- Quanto rendeu a venda. Preenchido ao fechar; é isto que se reparte.
  "sale_amount" DECIMAL(12,2),

  -- Classificação de risco, à maneira das plataformas de financiamento
  -- colaborativo. Texto livre e não enum: é um juízo do cliente, não um
  -- cálculo, e amanhã pode querer outra escala.
  "risk_level" TEXT,
  "image_url"  TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "investment_projects_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "investment_projects_status_idx"
  ON "investment_projects" ("status");
CREATE INDEX IF NOT EXISTS "investment_projects_vehicle_idx"
  ON "investment_projects" ("vehicle_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- A participação de cada investidor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "project_shares" (
  "id"         TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,

  -- Quanto pôs. É isto que TRANCA o capital: enquanto a participação está
  -- ACTIVE, este valor sai do disponível da conta dele (ver a view no fim)
  -- mas continua a contar como capital — porque a empresa continua a devê-lo.
  "amount" DECIMAL(12,2) NOT NULL,

  "status" "ProjectShareStatus" NOT NULL DEFAULT 'ACTIVE',

  -- O que voltou na liquidação, e a diferença para o que pôs. Guardados para
  -- o extrato poder explicar a mais-valia (ou a perda) sem refazer a conta.
  "liquidated_amount" DECIMAL(12,2),
  "liquidated_at"     TIMESTAMP(3),

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_shares_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE,
  CONSTRAINT "project_shares_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "investor_accounts"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "project_shares_project_idx" ON "project_shares" ("project_id");
CREATE INDEX IF NOT EXISTS "project_shares_account_idx" ON "project_shares" ("account_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- Um mês do projeto
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "project_periods" (
  "id"         TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,

  -- Sempre o dia 1 do mês. Uma data e não um "2026-03" em texto: assim
  -- ordena, compara e faz contas de intervalo sem converter nada.
  "month" DATE NOT NULL,

  -- As parcelas, guardadas à vista. Sem isto, um investidor que pergunte "de
  -- onde vem este valor" não tem resposta.
  "commission_total"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "vehicle_fee_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "expenses_total"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "settlements_count" INTEGER NOT NULL DEFAULT 0,

  -- comissão + aluguer − despesas
  "profit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- A fatia dos investidores: profit × profit_share ÷ 100, nunca negativa.
  "investors_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  -- A percentagem em vigor no momento do apuramento, congelada. Mudar a
  -- percentagem do projeto não pode reescrever meses já pagos.
  "profit_share" DECIMAL(5,2) NOT NULL,

  "status" "ProjectPeriodStatus" NOT NULL DEFAULT 'DRAFT',
  "distributed_at" TIMESTAMP(3),
  "notes" TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_periods_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE
);

-- Um mês por projeto. É a rede que impede pagar o mesmo mês duas vezes, e não
-- depende de ninguém se lembrar de conferir.
CREATE UNIQUE INDEX IF NOT EXISTS "project_periods_project_month_key"
  ON "project_periods" ("project_id", "month");

-- ═══════════════════════════════════════════════════════════════════════════
-- Despesas que não passam no fecho semanal
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Seguro, revisão, pneus, IUC. O fecho semanal só conhece o que o motorista
-- gastou; isto é o que a empresa gastou COM O CARRO, e sem um sítio para o
-- lançar o lucro apurado seria sempre otimista.

CREATE TABLE IF NOT EXISTS "project_expenses" (
  "id"         TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "month"      DATE NOT NULL,
  "amount"     DECIMAL(12,2) NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,

  CONSTRAINT "project_expenses_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_expenses_project_month_idx"
  ON "project_expenses" ("project_id", "month");

-- ═══════════════════════════════════════════════════════════════════════════
-- Ligar os movimentos do investidor ao projeto que os gerou
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sem isto, o extrato do investidor mostrava "+142,30 €" sem dizer de que
-- carro veio — e ele tem participações em vários.

ALTER TABLE "investor_movements" ADD COLUMN IF NOT EXISTS "project_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "investor_movements"
    ADD CONSTRAINT "investor_movements_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "investor_movements_project_idx"
  ON "investor_movements" ("project_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- A view: o capital trancado em projetos sai do disponível
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Colunas novas NO FIM: o CREATE OR REPLACE VIEW do Postgres só aceita colunas
-- acrescentadas depois das existentes, e quem lê a view por nome não dá pela
-- diferença.
--
-- `capital` NÃO muda: o dinheiro continua a ser devido ao investidor, esteja
-- num projeto ou não. O que muda é `available_capital`, que passa a descontar
-- o que está aplicado — senão dava para pedir o resgate de dinheiro que está
-- dentro de um carro.

CREATE OR REPLACE VIEW investor_balances AS
SELECT
  a."id"                                   AS account_id,
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

  -- Capital aplicado em projetos abertos. Informativo e ao mesmo tempo a
  -- parcela que o disponível desconta acima.
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
