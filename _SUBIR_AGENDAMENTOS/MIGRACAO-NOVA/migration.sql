-- Pagamentos agendados e lembretes.
--
-- ═══ PAGAMENTOS AGENDADOS ══════════════════════════════════════════════════
--
-- Um seguro mensal, uma quota, uma multa em seis prestações: tudo isto era
-- lançado à mão, todos os meses, em cada motorista. O que falha nesse processo
-- não é o cálculo — é a memória.
--
-- `scheduled_payments` guarda a REGRA. Quando chega a data, o job cria um
-- `balance_adjustments` normal, igual ao que sairia de alguém o lançar à mão.
-- Foi pedido assim ("aparece esse movimento ao motorista como se fosse
-- manual") e é também o que evita trabalho: o extrato, o saldo, os relatórios
-- e o recibo já sabem ler ajustes. Um tipo novo de movimento obrigaria a
-- ensinar-lhes a todos, e algum ficaria por ensinar.
--
-- ─── next_run_on É ESCRITA, NÃO CALCULADA ──────────────────────────────────
--
-- Podia deduzir-se de starts_on mais o intervalo, e parece mais limpo. Parte-se
-- no dia em que o servidor esteve em baixo e falhou uma execução: a conta diria
-- que a próxima é daqui a um mês, e o mês saltado desaparecia sem nada a
-- dizê-lo. Escrita, a data fica para trás, o job vê-a vencida, e paga o que
-- ficou por pagar.
--
-- ─── OS TIPOS SÃO UMA TABELA E NÃO UM enum ─────────────────────────────────
--
-- Porque quem usa isto tem de poder acrescentar os seus. Um enum do Prisma
-- precisa de uma migração e de um deploy para ganhar um valor novo — ou seja,
-- precisa de um programador. Numa tabela, escreve-se e usa-se no minuto
-- seguinte.
--
-- ═══ LEMBRETES ═════════════════════════════════════════════════════════════
--
-- Um lembrete que avisa uma vez perde-se entre as notificações do dia. Este
-- volta todos os dias até alguém o dar por feito.
--
-- `last_notified_on` guarda o DIA e não o instante: é o que garante uma
-- notificação por dia mesmo que o job corra duas vezes, num reinício do
-- servidor ou num deploy a meio da manhã.

-- O Postgres não tem CREATE TYPE IF NOT EXISTS. Sem o bloco, correr esta
-- migração numa base que já a tenha — uma restauração, um ambiente recriado —
-- rebentava logo na primeira linha.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentFrequency') THEN
    CREATE TYPE "PaymentFrequency" AS ENUM (
      'UNICO', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "payment_categories" (
  "id"         TEXT NOT NULL,
  "label"      TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_categories_label_key"
  ON "payment_categories" ("label");

CREATE TABLE IF NOT EXISTS "scheduled_payments" (
  "id"            TEXT NOT NULL,
  "user_id"       TEXT NOT NULL,
  "type"          "AdjustmentType" NOT NULL,
  "amount"        DECIMAL(12,2) NOT NULL,
  "description"   TEXT NOT NULL,
  "category_id"   TEXT,
  "frequency"     "PaymentFrequency" NOT NULL,
  "starts_on"     DATE NOT NULL,
  "next_run_on"   DATE,
  "ends_on"       DATE,
  "remaining"     INTEGER,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "run_count"     INTEGER NOT NULL DEFAULT 0,
  "last_run_at"   TIMESTAMP(3),
  "created_by_id" TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scheduled_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scheduled_payments_user_id_idx"
  ON "scheduled_payments" ("user_id");

-- O job pergunta sempre a mesma coisa: quais os activos com data vencida.
CREATE INDEX IF NOT EXISTS "scheduled_payments_active_next_run_on_idx"
  ON "scheduled_payments" ("active", "next_run_on");

CREATE TABLE IF NOT EXISTS "reminders" (
  "id"               TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "notes"            TEXT,
  "due_on"           DATE NOT NULL,
  "owner_id"         TEXT NOT NULL,
  "done_at"          TIMESTAMP(3),
  "last_notified_on" DATE,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reminders_owner_id_done_at_idx"
  ON "reminders" ("owner_id", "done_at");

CREATE INDEX IF NOT EXISTS "reminders_due_on_idx"
  ON "reminders" ("due_on");

-- O Postgres não tem ADD CONSTRAINT IF NOT EXISTS. Sem os blocos, correr a
-- migração numa base que já a tenha (uma restauração, um ambiente recriado)
-- rebentava.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_payments_user_id_fkey') THEN
    ALTER TABLE "scheduled_payments"
      ADD CONSTRAINT "scheduled_payments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_payments_created_by_id_fkey') THEN
    ALTER TABLE "scheduled_payments"
      ADD CONSTRAINT "scheduled_payments_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- SET NULL e não CASCADE: desligar um tipo de pagamento nao pode levar
  -- consigo os agendamentos que o usavam.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_payments_category_id_fkey') THEN
    ALTER TABLE "scheduled_payments"
      ADD CONSTRAINT "scheduled_payments_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "payment_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_owner_id_fkey') THEN
    ALTER TABLE "reminders"
      ADD CONSTRAINT "reminders_owner_id_fkey"
      FOREIGN KEY ("owner_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Alguns tipos para a lista não começar vazia. Sao um ponto de partida e
-- podem ser desligados ou renomeados no painel.
INSERT INTO "payment_categories" ("id", "label") VALUES
  ('seed_pc_seguro',    'Seguro'),
  ('seed_pc_multa',     'Multa'),
  ('seed_pc_quota',     'Quota'),
  ('seed_pc_caucao',    'Caução'),
  ('seed_pc_adiantam',  'Adiantamento'),
  ('seed_pc_premio',    'Prémio'),
  ('seed_pc_outro',     'Outro')
ON CONFLICT ("label") DO NOTHING;
