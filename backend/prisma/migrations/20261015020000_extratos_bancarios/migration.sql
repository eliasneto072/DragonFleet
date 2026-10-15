-- Importação de extratos bancários: contas, ficheiros importados e movimentos.
--
-- ─── O QUE ISTO GUARDA, E O QUE NÃO GUARDA ──────────────────────────────────
--
-- Guarda o que o banco diz: que contas existem, que ficheiros foram
-- importados, e que movimentos vieram em cada um.
--
-- NÃO guarda uma segunda versão das despesas. Quando um movimento passa a
-- contar — uma despesa da empresa, ou uma despesa pessoal que desconta do
-- saldo — ele CRIA uma linha nas tabelas que já existem (`company_expenses`,
-- `personal_expenses`) e guarda aqui o ponteiro para ela.
--
-- É de propósito, e é a decisão mais importante deste ficheiro. O cálculo do
-- lucro e do saldo já lê aquelas tabelas, já está testado, e já é usado nos
-- ecrãs. Uma segunda fonte para os mesmos números acabaria por divergir da
-- primeira — e aí há dois ecrãs a dizer coisas diferentes sobre o mesmo
-- dinheiro, que é o pior resultado possível de um importador.
--
-- ─── PORQUE É QUE AS ENTRADAS DA EMPRESA NÃO CONTAM COMO RECEITA ────────────
--
-- Porque já estão contadas. O extrato de Agosto da conta da empresa tem mais
-- de dez mil euros de entradas, e quase tudo é dinheiro da Uber e da Bolt que
-- os fechos semanais já registaram. Importá-las como receita contava o mesmo
-- dinheiro duas vezes e dava um lucro inventado.
--
-- Ficam guardadas como movimento, para se verem e conferirem, e nunca criam
-- uma linha de receita. A receita continua a vir dos fechos — fonte única.
--
-- ─── PORQUE É QUE NO PESSOAL É ELE QUE DECIDE LINHA A LINHA ────────────────
--
-- Porque o saldo de motorista dele não é a conta bancária dele: é o que a
-- empresa lhe deve. Um almoço pago com o cartão pessoal sai do banco e não
-- tem nada a ver com esse saldo; mas há despesas que ele quer mesmo descontar
-- lá. Só ele sabe quais, por isso o movimento nasce sem efeito e é a revisão
-- que lhe dá um.
--
-- Não há dados a migrar. Todo o DDL é guardado: correr isto duas vezes dá o
-- mesmo resultado que correr uma.

-- ─── O lock_timeout QUE FALTAVA A TODAS AS OUTRAS MIGRAÇÕES ─────────────────
--
-- Sem isto, um `ALTER TABLE` que não consiga o bloqueio espera PARA SEMPRE —
-- e, enquanto espera, põe na fila atrás dele todas as consultas à mesma
-- tabela. Um deploy pendurado leva o site atrás.
--
-- Com dez segundos, a migração falha depressa e o deploy pode voltar a
-- correr-se. Um deploy que falha é barato; um deploy pendurado não é.
--
-- `SET LOCAL` porque o Prisma corre cada migração dentro de uma transação:
-- assim o limite acaba com ela e não fica a afectar a sessão.
-- ─── PORQUE É QUE ESTAS TABELAS NÃO SE CHAMAM `bank_*` ──────────────────────
--
-- Porque `bank_accounts` JÁ EXISTE: é a tabela dos IBAN dos motoristas, com a
-- aprovação do comprovativo. A primeira versão desta migração chamava-lhe o
-- mesmo nome, e o `CREATE TABLE IF NOT EXISTS` não dava erro — saltava a
-- criação em silêncio e só rebentava três linhas abaixo, a criar um índice
-- sobre uma coluna que não existia.
--
-- Em produção isso deixava a migração a meio e o deploy parado. Foi a
-- repetição numa base limpa que o apanhou, não a leitura do ficheiro.
--
-- `statement_*` porque é disso que se trata: as contas, os ficheiros e os
-- movimentos de EXTRATOS. O nome diz o assunto e não colide com nada.

SET LOCAL lock_timeout = '10s';

-- ─── CONTAS ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankCode') THEN
    CREATE TYPE "BankCode" AS ENUM (
      'ABANCA', 'NOVO_BANCO', 'MILLENNIUM', 'REVOLUT', 'REVOLUT_BUSINESS'
    );
  END IF;
  -- De quem é a conta: dele ou da empresa. Decide para onde vão as despesas
  -- e qual dos dois ecrãs a mostra.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BankScope') THEN
    CREATE TYPE "BankScope" AS ENUM ('PESSOAL', 'EMPRESA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MovementClass') THEN
    CREATE TYPE "MovementClass" AS ENUM ('DESPESA', 'RECEITA', 'TRANSFERENCIA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "statement_accounts" (
  "id"       TEXT NOT NULL,
  "fleet_id" TEXT NOT NULL DEFAULT '',

  "bank"  "BankCode" NOT NULL,
  "scope" "BankScope" NOT NULL,

  -- Os QUATRO ÚLTIMOS dígitos do IBAN, e mais nada.
  --
  -- Chegam para ele reconhecer a conta e para o sistema não misturar duas
  -- contas do mesmo banco — que são as duas únicas coisas para que isto
  -- serve. Um IBAN inteiro numa base de dados é um risco que não se paga a
  -- troco de nenhuma funcionalidade.
  "tail" TEXT NOT NULL,

  -- O nome que ele lhe dá: «Abanca empresa», «Revolut pessoal».
  "label" TEXT NOT NULL,

  -- A quem pertence, nas contas pessoais. Nulo nas da empresa.
  "owner_id" TEXT,

  "active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "statement_accounts_pkey" PRIMARY KEY ("id")
);

-- Uma conta por banco e por terminação. Duas iguais e deixa de haver resposta
-- para «de que conta é este extrato».
CREATE UNIQUE INDEX IF NOT EXISTS "statement_accounts_fleet_bank_tail_key"
  ON "statement_accounts" ("fleet_id", "bank", "tail");

-- ─── FICHEIROS IMPORTADOS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "statement_files" (
  "id"         TEXT NOT NULL,
  "fleet_id"   TEXT NOT NULL DEFAULT '',
  "account_id" TEXT NOT NULL,

  "period_start" DATE,
  "period_end"   DATE,

  "opening_balance" DECIMAL(12,2),
  "closing_balance" DECIMAL(12,2),

  -- O ficheiro, guardado para se poder voltar a ele. Opcional: se o envio
  -- para o armazenamento falhar, os movimentos não se perdem por causa disso.
  "file_name" TEXT,
  "file_url"  TEXT,
  "file_key"  TEXT,

  -- ─── A IMPRESSÃO DIGITAL DO FICHEIRO ──────────────────────────────────
  --
  -- SHA-256 do PDF. É isto que impede importar o mesmo extrato duas vezes —
  -- e importar duas vezes é o engano mais fácil de cometer e o mais difícil
  -- de detectar depois, porque os movimentos repetidos parecem todos
  -- legítimos.
  --
  -- Pelo conteúdo e não pelo nome: o mesmo extrato descarregado outra vez
  -- chama-se «(1)» e é o mesmo ficheiro.
  "file_hash" TEXT NOT NULL,

  "imported_by_id" TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "statement_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "statement_files_fleet_hash_key"
  ON "statement_files" ("fleet_id", "file_hash");

-- ─── MOVIMENTOS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "statement_movements" (
  "id"           TEXT NOT NULL,
  "fleet_id"     TEXT NOT NULL DEFAULT '',
  "statement_id" TEXT NOT NULL,
  "account_id"   TEXT NOT NULL,

  -- A data VALOR: é a que decide em que mês o movimento entra.
  "occurred_on" DATE NOT NULL,
  -- A de lançamento, quando o banco as distingue. Serve para encontrar o
  -- movimento no homebanking; não entra em conta nenhuma.
  "booked_on"   DATE,

  "description" TEXT NOT NULL,

  -- Negativo saiu, positivo entrou. Sempre, em todos os bancos.
  "amount"  DECIMAL(12,2) NOT NULL,
  -- O saldo impresso pelo banco. Guardado porque é a prova: é contra ele que
  -- a importação se verificou, e é com ele que se volta a verificar um dia.
  "balance" DECIMAL(12,2),

  "reference" TEXT,

  "class" "MovementClass" NOT NULL,

  -- A posição no extrato. Com ela, a lista mostra-se pela ordem do banco
  -- mesmo quando dois movimentos têm a mesma data.
  "position" INTEGER NOT NULL DEFAULT 0,

  -- ─── OS PONTEIROS PARA AS DESPESAS A SÉRIO ────────────────────────────
  --
  -- Nulos quer dizer «este movimento não conta para nada» — e é o estado em
  -- que a maioria nasce. Quando ele decide que conta, cria-se a linha na
  -- tabela de despesas respectiva e guarda-se aqui o ponteiro.
  --
  -- ON DELETE SET NULL: apagar a despesa não apaga o movimento. O extrato do
  -- banco é um facto e não deve desaparecer porque alguém arrumou as contas.
  "company_expense_id"  TEXT,
  "personal_expense_id" TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "statement_movements_pkey" PRIMARY KEY ("id")
);

-- Um movimento não pode estar ligado às duas tabelas ao mesmo tempo: ou é da
-- empresa ou é dele. Sem esta guarda, uma linha contava duas vezes em dois
-- sítios diferentes e nenhum dos dois ecrãs mostrava o outro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_movements_uma_despesa_so') THEN
    ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_uma_despesa_so"
      CHECK ("company_expense_id" IS NULL OR "personal_expense_id" IS NULL);
  END IF;
END $$;

-- ─── CHAVES ESTRANGEIRAS ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_accounts_fleet_id_fkey') THEN
    ALTER TABLE "statement_accounts" ADD CONSTRAINT "statement_accounts_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_accounts_owner_fkey') THEN
    ALTER TABLE "statement_accounts" ADD CONSTRAINT "statement_accounts_owner_fkey"
      FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_files_fleet_id_fkey') THEN
    ALTER TABLE "statement_files" ADD CONSTRAINT "statement_files_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- Apagar a conta leva os extratos e os movimentos dela: sem a conta, não
  -- querem dizer nada.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_files_account_fkey') THEN
    ALTER TABLE "statement_files" ADD CONSTRAINT "statement_files_account_fkey"
      FOREIGN KEY ("account_id") REFERENCES "statement_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_files_imported_by_fkey') THEN
    ALTER TABLE "statement_files" ADD CONSTRAINT "statement_files_imported_by_fkey"
      FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_movements_fleet_id_fkey') THEN
    ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_movements_statement_fkey') THEN
    ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_statement_fkey"
      FOREIGN KEY ("statement_id") REFERENCES "statement_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_movements_account_fkey') THEN
    ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_account_fkey"
      FOREIGN KEY ("account_id") REFERENCES "statement_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- A despesa pode ser apagada no ecrã dela; o movimento fica, sem ponteiro.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_movements_company_expense_fkey') THEN
    ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_company_expense_fkey"
      FOREIGN KEY ("company_expense_id") REFERENCES "company_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'statement_movements_personal_expense_fkey') THEN
    ALTER TABLE "statement_movements" ADD CONSTRAINT "statement_movements_personal_expense_fkey"
      FOREIGN KEY ("personal_expense_id") REFERENCES "personal_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "statement_accounts_fleet_idx"   ON "statement_accounts" ("fleet_id", "scope");
CREATE INDEX IF NOT EXISTS "statement_accounts_owner_idx"   ON "statement_accounts" ("owner_id");
CREATE INDEX IF NOT EXISTS "statement_files_acc_idx"   ON "statement_files" ("account_id", "period_start");
CREATE INDEX IF NOT EXISTS "statement_movements_stmt_idx"   ON "statement_movements" ("statement_id", "position");
CREATE INDEX IF NOT EXISTS "statement_movements_acc_idx"    ON "statement_movements" ("account_id", "occurred_on");
CREATE INDEX IF NOT EXISTS "statement_movements_fleet_idx"  ON "statement_movements" ("fleet_id", "occurred_on");
