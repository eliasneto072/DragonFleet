-- As contas da empresa: despesas e o saldo em caixa.
--
-- ─── O QUE ESTAS TABELAS SÃO, E O QUE NÃO SÃO ───────────────────────────────
--
-- São o que falta ao sistema para responder a duas perguntas que ele hoje não
-- sabe responder:
--
--   «O negócio dá dinheiro?»   → lucro  = receita da frota − despesas daqui
--   «Tenho dinheiro na conta?» → caixa  = saldo declarado − o que é dos motoristas
--
-- NÃO são um livro de caixa. O pagamento a um motorista não se lança aqui, e é
-- de propósito: o que é dele nunca foi receita da empresa, por isso descontá-lo
-- outra vez como despesa contava-o duas vezes e dava um lucro muito abaixo do
-- real. Ver a nota longa em `src/modules/company/lucro.ts`.
--
-- ─── PORQUE É QUE O SALDO DO BANCO É DECLARADO E NÃO CALCULADO ──────────────
--
-- Porque a aplicação não vê o banco. As prestações dos créditos saem por débito
-- direto, as despesas pagas com o cartão pessoal entram por outro lado, e nada
-- disso passa por aqui. Um saldo calculado só com o que a aplicação conhece
-- estaria sempre errado — e errado para MAIS, que é o pior lado: dava a ideia
-- de haver dinheiro que não há.
--
-- Guarda-se o histórico das declarações, e não só a última. Com histórico vê-se
-- a evolução da conta e detecta-se uma declaração enganada; com um valor só,
-- um engano apaga o anterior e não há a que voltar.
--
-- Não há dados a migrar. Todo o DDL é guardado: correr isto duas vezes dá o
-- mesmo resultado que correr uma.

-- ─── CATEGORIAS DE DESPESA ──────────────────────────────────────────────────
--
-- Da FROTA e não de uma pessoa, ao contrário das categorias pessoais: estas
-- são o plano de contas da empresa, e quem as arruma arruma-as para todos.

CREATE TABLE IF NOT EXISTS "company_expense_categories" (
  "id"         TEXT NOT NULL,
  "fleet_id"   TEXT NOT NULL DEFAULT '',
  "name"       TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_expense_categories_fleet_name_key"
  ON "company_expense_categories" ("fleet_id", "name");

-- ─── DESPESAS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "company_expenses" (
  "id"          TEXT NOT NULL,
  "fleet_id"    TEXT NOT NULL DEFAULT '',
  "category_id" TEXT,

  -- Sempre positivo. É uma despesa: um valor negativo aqui seria uma receita
  -- disfarçada a somar ao lucro.
  "amount"   DECIMAL(12,2) NOT NULL,
  "spent_on" DATE NOT NULL,
  "supplier" TEXT,
  "notes"    TEXT,

  -- Opcional, e pode chegar depois do lançamento.
  "receipt_url" TEXT,
  "receipt_key" TEXT,

  -- Quem lançou. Fica para auditoria; a conta não depende disto.
  "created_by_id" TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_expenses_pkey" PRIMARY KEY ("id")
);

-- ─── O SALDO DECLARADO ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "company_cash_marks" (
  "id"       TEXT NOT NULL,
  "fleet_id" TEXT NOT NULL DEFAULT '',

  -- O saldo da conta bancária nesse dia. Pode ser negativo: uma conta a
  -- descoberto é um estado possível, e travá-lo a zero escondia precisamente
  -- a situação que é preciso ver.
  "balance"     DECIMAL(12,2) NOT NULL,
  "observed_on" DATE NOT NULL,
  "notes"       TEXT,

  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_cash_marks_pkey" PRIMARY KEY ("id")
);

-- Uma declaração por dia. Duas no mesmo dia e deixa de haver resposta para
-- «qual era o saldo nesse dia» — e é essa a única pergunta que esta tabela
-- existe para responder.
CREATE UNIQUE INDEX IF NOT EXISTS "company_cash_marks_fleet_day_key"
  ON "company_cash_marks" ("fleet_id", "observed_on");

-- ─── CHAVES ESTRANGEIRAS ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_expense_categories_fleet_id_fkey') THEN
    ALTER TABLE "company_expense_categories" ADD CONSTRAINT "company_expense_categories_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_expenses_fleet_id_fkey') THEN
    ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- A categoria fica nula se for apagada: a despesa não se perde por causa de
  -- uma arrumação, e o total por categoria continua a bater com o total geral.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_expenses_category_id_fkey') THEN
    ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "company_expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_expenses_created_by_fkey') THEN
    ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_created_by_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_cash_marks_fleet_id_fkey') THEN
    ALTER TABLE "company_cash_marks" ADD CONSTRAINT "company_cash_marks_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_cash_marks_created_by_fkey') THEN
    ALTER TABLE "company_cash_marks" ADD CONSTRAINT "company_cash_marks_created_by_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Uma despesa de zero euros não é uma despesa. A guarda fica na base e não
-- numa lembrança de quem escreve o formulário.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_expenses_amount_positive') THEN
    ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_amount_positive"
      CHECK ("amount" > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "company_expense_categories_fleet_idx" ON "company_expense_categories" ("fleet_id");
CREATE INDEX IF NOT EXISTS "company_expenses_fleet_date_idx" ON "company_expenses" ("fleet_id", "spent_on");
CREATE INDEX IF NOT EXISTS "company_expenses_category_idx"   ON "company_expenses" ("category_id");
CREATE INDEX IF NOT EXISTS "company_cash_marks_fleet_idx"    ON "company_cash_marks" ("fleet_id", "observed_on");
