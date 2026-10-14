-- Finanças pessoais: o diário de trading e as despesas pessoais.
--
-- ─── PARA QUEM É ISTO ───────────────────────────────────────────────────────
--
-- Para uma conta de motorista com a marca `personal_finance` ligada. Está
-- desligada em TODA a gente — incluindo em quem a criar a seguir — e só o dono
-- da plataforma a liga.
--
-- Fez-se com uma marca e não com o email de uma pessoa escrito numa condição.
-- O email ficaria publicado no código, deixaria de funcionar no dia em que
-- mudasse, e obrigaria a mexer no programa para o ligar noutra conta. É a
-- mesma razão por que o dono da plataforma é um `is_owner` e não um nome.
--
-- ─── O QUE MEXE NO SALDO E O QUE NÃO MEXE ───────────────────────────────────
--
-- As DESPESAS saem do saldo. Mas não têm porta própria: cada despesa escreve
-- um débito em `balance_adjustments`, que é a porta que já existe, e é essa
-- linha que o saldo desconta. A fórmula do saldo vive na vista
-- `driver_balances` e NÃO é tocada aqui — já esteve copiada em quatro sítios e
-- uma correção foi aplicada numa cópia e esquecida noutra.
--
-- O TRADING não mexe em nada. É estatística, e fica numa tabela isolada: nem
-- toca no saldo, nem entra em relatório nenhum da frota.
--
-- ─── O RESULTADO DE UMA OPERAÇÃO É BRUTO, E AS COMISSÕES DESCONTAM ──────────
--
-- `result` é o resultado antes de comissões e `fees` são as comissões; o
-- líquido é a diferença. Podia ter-se guardado só o líquido, mas então as
-- comissões ficavam a enfeitar sem entrarem em conta nenhuma — e num diário de
-- operações elas são metade da lição.
--
-- O engano possível (escrever o líquido no campo do bruto) joga CONTRA quem
-- escreve: as contas aparecem mais baixas do que a realidade, e isso nota-se.
-- O contrário — guardar líquido e enganar-se para cima — passava despercebido.
--
-- Não há dados a migrar. Todo o DDL é guardado: correr isto duas vezes dá o
-- mesmo resultado que correr uma.

-- ─── A MARCA ────────────────────────────────────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "personal_finance" BOOLEAN NOT NULL DEFAULT false;

-- ─── TRADING ────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeDirection') THEN
    CREATE TYPE "TradeDirection" AS ENUM ('LONG', 'SHORT');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "trade_entries" (
  "id"          TEXT NOT NULL,
  "fleet_id"    TEXT NOT NULL DEFAULT '',
  "user_id"     TEXT NOT NULL,

  -- O que negociou. Texto livre de propósito: um par de divisas, uma cripto,
  -- uma ação, um índice. Uma lista fechada ficava desactualizada à primeira
  -- coisa nova que ele quisesse registar.
  "asset"       TEXT NOT NULL,
  "broker"      TEXT,
  "direction"   "TradeDirection" NOT NULL,

  "opened_at"   DATE NOT NULL,
  -- Nulo enquanto a posição está aberta. É a diferença entre "ainda não
  -- fechou" e "fechou no mesmo dia", que um zero não sabe dizer.
  "closed_at"   DATE,

  -- Contexto da operação. Todos opcionais: um formulário que obrigue a oito
  -- campos é um formulário que se deixa de preencher ao fim de uma semana, e
  -- um diário por preencher não serve para nada.
  "size"        DECIMAL(18,8),
  "entry_price" DECIMAL(18,8),
  "exit_price"  DECIMAL(18,8),

  -- O resultado BRUTO, em euros. Positivo ou negativo — é o único campo que
  -- as estatísticas todas usam, e por isso é obrigatório.
  "result"      DECIMAL(12,2) NOT NULL,
  "fees"        DECIMAL(12,2) NOT NULL DEFAULT 0,

  "notes"       TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trade_entries_pkey" PRIMARY KEY ("id")
);

-- ─── CATEGORIAS DE DESPESA ──────────────────────────────────────────────────
--
-- São de cada pessoa e não da frota: é a lista de gavetas dele, e não um
-- catálogo que alguém da empresa administre.

CREATE TABLE IF NOT EXISTS "personal_expense_categories" (
  "id"         TEXT NOT NULL,
  "fleet_id"   TEXT NOT NULL DEFAULT '',
  "user_id"    TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "personal_expense_categories_pkey" PRIMARY KEY ("id")
);

-- Duas gavetas com o mesmo nome na mesma pessoa tornam os totais por categoria
-- impossíveis de ler. Entre pessoas diferentes, repetir é normal.
CREATE UNIQUE INDEX IF NOT EXISTS "personal_expense_categories_user_name_key"
  ON "personal_expense_categories" ("user_id", "name");

-- ─── DESPESAS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "personal_expenses" (
  "id"          TEXT NOT NULL,
  "fleet_id"    TEXT NOT NULL DEFAULT '',
  "user_id"     TEXT NOT NULL,
  "category_id" TEXT,

  -- Sempre positivo. É uma despesa: o sinal está no nome da tabela, e um
  -- valor negativo aqui seria uma receita disfarçada a somar ao saldo.
  "amount"      DECIMAL(12,2) NOT NULL,
  "spent_on"    DATE NOT NULL,
  "notes"       TEXT,

  -- O comprovativo é opcional e pode chegar depois — foi o que ele pediu.
  -- Guardar a chave além do endereço é o que permite apagar o ficheiro do
  -- armazenamento quando a linha desaparecer.
  "receipt_url" TEXT,
  "receipt_key" TEXT,

  -- O débito que esta despesa escreveu no saldo.
  --
  -- Nulo é possível e quer dizer "ainda não foi lançado", que não deve
  -- acontecer mas é melhor do que uma linha que se recusa a existir. Ao
  -- apagar o ajuste, isto fica nulo em vez de levar a despesa atrás: o
  -- registo pessoal dele não desaparece porque alguém mexeu no extrato.
  "adjustment_id" TEXT,

  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "personal_expenses_pkey" PRIMARY KEY ("id")
);

-- ─── CHAVES ESTRANGEIRAS ────────────────────────────────────────────────────
--
-- O `fleet_id` com chave para `fleets` é o que faz uma escrita que escape à
-- camada do âmbito falhar alto em vez de ir parar à frota errada em silêncio.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_entries_fleet_id_fkey') THEN
    ALTER TABLE "trade_entries" ADD CONSTRAINT "trade_entries_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_entries_user_id_fkey') THEN
    ALTER TABLE "trade_entries" ADD CONSTRAINT "trade_entries_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_expense_categories_fleet_id_fkey') THEN
    ALTER TABLE "personal_expense_categories" ADD CONSTRAINT "personal_expense_categories_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_expense_categories_user_id_fkey') THEN
    ALTER TABLE "personal_expense_categories" ADD CONSTRAINT "personal_expense_categories_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_expenses_fleet_id_fkey') THEN
    ALTER TABLE "personal_expenses" ADD CONSTRAINT "personal_expenses_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_expenses_user_id_fkey') THEN
    ALTER TABLE "personal_expenses" ADD CONSTRAINT "personal_expenses_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- A categoria fica nula se for apagada: a despesa não se perde por causa
  -- de uma gaveta arrumada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_expenses_category_id_fkey') THEN
    ALTER TABLE "personal_expenses" ADD CONSTRAINT "personal_expenses_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "personal_expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_expenses_adjustment_id_fkey') THEN
    ALTER TABLE "personal_expenses" ADD CONSTRAINT "personal_expenses_adjustment_id_fkey"
      FOREIGN KEY ("adjustment_id") REFERENCES "balance_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── ÍNDICES ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "trade_entries_fleet_id_idx"  ON "trade_entries" ("fleet_id");
CREATE INDEX IF NOT EXISTS "trade_entries_user_date_idx" ON "trade_entries" ("user_id", "opened_at");

CREATE INDEX IF NOT EXISTS "personal_expense_categories_fleet_id_idx" ON "personal_expense_categories" ("fleet_id");
CREATE INDEX IF NOT EXISTS "personal_expense_categories_user_id_idx"  ON "personal_expense_categories" ("user_id");

CREATE INDEX IF NOT EXISTS "personal_expenses_fleet_id_idx"  ON "personal_expenses" ("fleet_id");
CREATE INDEX IF NOT EXISTS "personal_expenses_user_date_idx" ON "personal_expenses" ("user_id", "spent_on");
CREATE INDEX IF NOT EXISTS "personal_expenses_category_idx"  ON "personal_expenses" ("category_id");

-- Um débito pertence a uma despesa e não a duas.
--
-- Único e não simples: é o que a relação um-para-um declara no schema, e sem
-- ele a base deixava passar duas despesas agarradas ao mesmo ajuste — que o
-- Prisma depois leria como uma só, perdendo a outra sem avisar. Os nulos não
-- colidem entre si, que é o que permite ter despesas ainda sem débito.
CREATE UNIQUE INDEX IF NOT EXISTS "personal_expenses_adjustment_id_key"
  ON "personal_expenses" ("adjustment_id");
