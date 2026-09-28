-- Portal do investidor (invest.dragonfleet.pt)
--
-- ─── O QUE ISTO É ───────────────────────────────────────────────────────────
--
-- Uma conta de investidor é dinheiro que ENTROU na empresa por transferência e
-- que a empresa deve. Não tem nada a ver com o saldo dos motoristas: o saldo do
-- motorista nasce do trabalho dele e está na view `driver_balances`; o do
-- investidor nasce de um depósito e está na view `investor_balances`, criada no
-- fim deste ficheiro.
--
-- ─── DOIS BOLSOS, NÃO UM ────────────────────────────────────────────────────
--
-- Cada conta tem CAPITAL e RENDIMENTO, separados. O capital é o que foi
-- depositado; o rendimento é o que os juros somaram. Podiam ser um número só,
-- mas não devem:
--
--   • o investidor quer poder levantar o rendimento sem tocar no capital — que
--     é precisamente o que faz um produto destes valer a pena;
--   • os juros do dia contam sobre o CAPITAL e não sobre o total (juros
--     simples, a regra já decidida para os motoristas). Com um número só, os
--     juros começavam a render juros sem ninguém ter decidido isso;
--   • contabilisticamente são coisas diferentes: um é dívida de capital, o
--     outro é gasto financeiro do exercício.
--
-- ─── PORQUE É QUE OS MOVIMENTOS SÃO UMA TABELA E O SALDO É UMA VIEW ─────────
--
-- Não há coluna `saldo` em lado nenhum. O saldo é a soma dos movimentos, e é a
-- view que a faz. É o mesmo princípio do `driver_balances`: uma coluna de saldo
-- pode ficar dessincronizada do extrato que a explica, e quando isso acontece
-- ninguém sabe qual dos dois números está certo. Uma soma não pode discordar
-- das parcelas.
--
-- Por isso `amount` é COM SINAL: um depósito é positivo, um resgate é negativo.
-- Somar a coluna dá o saldo, sem casos especiais.

-- ═══════════════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "InvestorAccountStatus" AS ENUM ('ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CAPITAL = o que foi depositado. EARNINGS = o que os juros somaram.
DO $$ BEGIN
  CREATE TYPE "InvestorBucket" AS ENUM ('CAPITAL', 'EARNINGS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvestorMovementKind" AS ENUM (
    'DEPOSIT',     -- entrada de dinheiro, registada pela administração
    'ACCRUAL',     -- juro de um dia
    'WITHDRAWAL',  -- resgate pago
    'ADJUSTMENT'   -- correção manual, sempre com motivo escrito
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvestorWithdrawalStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Conta
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "investor_accounts" (
  "id"              TEXT PRIMARY KEY,
  "user_id"         TEXT NOT NULL UNIQUE,

  -- Primeiro dia que pode render. Normalmente o dia do primeiro depósito, mas
  -- editável: um contrato pode começar a contar antes de o dinheiro chegar.
  "start_date"      DATE NOT NULL,

  -- Último dia já pago em movimentos ACCRUAL. NULL = ainda não rendeu nada.
  -- É isto que torna o cálculo diário repetível: o trabalho recomeça sempre no
  -- dia seguinte a este, e correr o job duas vezes no mesmo dia não paga a
  -- dobrar.
  "accrued_through" DATE,

  -- Dias de aviso prévio para levantar CAPITAL. Zero = levanta quando quiser.
  -- Não se aplica ao rendimento, que é sempre de acesso livre.
  "notice_days"     INTEGER NOT NULL DEFAULT 0,

  "status"          "InvestorAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"           TEXT,

  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- RESTRICT, não CASCADE: apagar um utilizador não pode levar por à frente o
  -- registo do dinheiro que ele pôs cá dentro. Quem quiser apagar a conta tem
  -- de fechar a posição primeiro, e isso obriga a alguém a olhar para o saldo.
  CONSTRAINT "investor_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Histórico de taxas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A taxa não vive na conta — vive aqui, com a data a partir da qual vale.
--
-- Se a taxa fosse uma coluna na conta, baixá-la em outubro mudava também os
-- juros de setembro no próximo recálculo, e o extrato do investidor mudava
-- debaixo dos pés dele. Com histórico, cada dia é pago à taxa que estava em
-- vigor NESSE dia, e alterar a taxa hoje não reescreve o passado.

CREATE TABLE IF NOT EXISTS "investor_rates" (
  "id"             TEXT PRIMARY KEY,
  "account_id"     TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "annual_rate"    DECIMAL(6,3) NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"     TEXT,

  CONSTRAINT "investor_rates_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "investor_accounts"("id") ON DELETE CASCADE
);

-- Uma taxa por dia por conta: duas linhas com a mesma data deixavam o cálculo
-- dependente da ordem de leitura.
CREATE UNIQUE INDEX IF NOT EXISTS "investor_rates_account_from_key"
  ON "investor_rates" ("account_id", "effective_from");

-- ═══════════════════════════════════════════════════════════════════════════
-- Movimentos — o extrato
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "investor_movements" (
  "id"          TEXT PRIMARY KEY,
  "account_id"  TEXT NOT NULL,

  -- Dia civil em Lisboa a que o movimento pertence. Separado do created_at de
  -- propósito: o juro do dia 30 é lançado pelo job na madrugada do dia 31, e o
  -- extrato tem de o mostrar no dia 30.
  "day"         DATE NOT NULL,

  "kind"        "InvestorMovementKind" NOT NULL,
  "bucket"      "InvestorBucket" NOT NULL,

  -- COM SINAL. Seis casas porque o juro de um dia raramente é um número
  -- redondo ao cêntimo, e arredondar todos os dias perde meio cêntimo por dia.
  -- Só o que sai para a conta bancária é arredondado, e uma vez só.
  "amount"      DECIMAL(16,6) NOT NULL,

  "description" TEXT,

  -- Preenchido quando o movimento nasce de um pedido de resgate.
  "withdrawal_id" TEXT,

  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"  TEXT,

  CONSTRAINT "investor_movements_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "investor_accounts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "investor_movements_account_day_idx"
  ON "investor_movements" ("account_id", "day");

-- A rede de segurança do cálculo diário: um dia só pode ter um juro.
--
-- Índice PARCIAL (só sobre ACCRUAL) porque os outros tipos repetem-se à
-- vontade no mesmo dia — dois depósitos na mesma tarde são dois depósitos.
-- Se o job correr duas vezes, a segunda tentativa bate contra isto e a
-- transação desfaz-se, em vez de pagar o dia a dobrar em silêncio.
CREATE UNIQUE INDEX IF NOT EXISTS "investor_movements_accrual_day_key"
  ON "investor_movements" ("account_id", "day")
  WHERE "kind" = 'ACCRUAL';

-- ═══════════════════════════════════════════════════════════════════════════
-- Pedidos de resgate
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "investor_withdrawals" (
  "id"           TEXT PRIMARY KEY,
  "account_id"   TEXT NOT NULL,
  "bucket"       "InvestorBucket" NOT NULL,

  -- Ao cêntimo: é o valor que vai sair para uma conta bancária.
  "amount"       DECIMAL(12,2) NOT NULL,

  "status"       "InvestorWithdrawalStatus" NOT NULL DEFAULT 'PENDING',

  -- Data a partir da qual pode ser pago, já com o aviso prévio contado. O
  -- pedido pode ser feito hoje e ficar à espera; guardar a data aqui evita ter
  -- de recalcular o prazo com as regras que vierem a existir amanhã.
  "available_on" DATE NOT NULL,

  "note"         TEXT,   -- escrita pelo investidor
  "decision"     TEXT,   -- escrita pela administração ao decidir

  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at"   TIMESTAMP(3),
  "decided_by"   TEXT,

  CONSTRAINT "investor_withdrawals_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "investor_accounts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "investor_withdrawals_account_idx"
  ON "investor_withdrawals" ("account_id");
CREATE INDEX IF NOT EXISTS "investor_withdrawals_status_idx"
  ON "investor_withdrawals" ("status");

-- ═══════════════════════════════════════════════════════════════════════════
-- A view — a única definição de saldo do investidor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tudo o que mostra dinheiro do investidor lê daqui: o portal dele, a tela da
-- administração e o total de responsabilidade da empresa. Assim não há dois
-- sítios a calcular a mesma coisa de maneiras diferentes.
--
-- Os pedidos PENDENTES são descontados do disponível, como nas retiradas dos
-- motoristas. Um pedido por decidir é dinheiro que já está prometido: se
-- continuasse a contar como disponível, dava para pedir duas vezes o mesmo.

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

  COALESCE(cap.total, 0) - COALESCE(pc.total, 0)
                                           AS available_capital,
  COALESCE(ear.total, 0) - COALESCE(pe.total, 0)
                                           AS available_earnings,

  COALESCE(dep.total, 0)                   AS deposited,
  COALESCE(wit.total, 0)                   AS withdrawn

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

-- Informativas: quanto entrou ao todo e quanto já saiu. Não entram no saldo,
-- servem para a tela da administração responder "quanto é que este investidor
-- já cá pôs" sem ter de somar o extrato à mão.
LEFT JOIN (
  SELECT "account_id", SUM("amount") AS total
  FROM "investor_movements" WHERE "kind" = 'DEPOSIT' GROUP BY "account_id"
) dep ON dep."account_id" = a."id"

LEFT JOIN (
  SELECT "account_id", -SUM("amount") AS total
  FROM "investor_movements" WHERE "kind" = 'WITHDRAWAL' GROUP BY "account_id"
) wit ON wit."account_id" = a."id";
