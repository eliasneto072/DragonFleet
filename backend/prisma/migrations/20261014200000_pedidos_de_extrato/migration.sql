-- Pedidos de esclarecimento sobre uma linha do fecho semanal.
--
-- ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
--
-- Um motorista olha para o fecho, vê «Via Verde − 14,45 €» e acha estranho.
-- Hoje a conversa acontece no WhatsApp: ele pergunta, alguém vai à Via Verde
-- buscar o extrato, manda uma fotografia, e passadas duas semanas ninguém se
-- lembra do que foi dito nem onde ficou o ficheiro. Da próxima vez que a mesma
-- pergunta aparecer, repete-se o trabalho todo.
--
-- Com isto: ele carrega na linha, fica um pedido registado, tu respondes com o
-- extrato anexado, e a resposta fica agarrada àquela semana para sempre.
--
-- ─── PORQUE É QUE SERVE QUALQUER LINHA E NÃO SÓ A VIA VERDE ─────────────────
--
-- Porque o combustível levanta exactamente a mesma dúvida, e o aluguer e o
-- imposto também, de vez em quando. A coluna `line` guarda qual é — e o dia em
-- que alguém duvidar de outra coisa não precisa de uma migração nova.
--
-- ─── PORQUE É QUE NÃO HÁ PRAZO PARA PEDIR ───────────────────────────────────
--
-- A dúvida sobre um valor aparece tarde: ao olhar para o saldo ao fim do mês,
-- ou a comparar duas semanas. Fechar a porta depois de a semana estar paga
-- empurrava a conversa de volta para o WhatsApp, que é exactamente o que isto
-- existe para evitar.
--
-- Não há dados a migrar. Todo o DDL é guardado: correr isto duas vezes dá o
-- mesmo resultado que correr uma.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SettlementLine') THEN
    CREATE TYPE "SettlementLine" AS ENUM (
      'VIA_VERDE', 'COMBUSTIVEL', 'CARREGAMENTO', 'VIATURA',
      'OUTRAS_DEDUCOES', 'IMPOSTO', 'COMISSAO', 'UBER', 'BOLT', 'OUTRA'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SettlementQueryStatus') THEN
    CREATE TYPE "SettlementQueryStatus" AS ENUM ('ABERTO', 'RESPONDIDO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "settlement_queries" (
  "id"       TEXT NOT NULL,
  "fleet_id" TEXT NOT NULL DEFAULT '',

  "settlement_id" TEXT NOT NULL,
  -- Quem perguntou. O fecho já diz de quem é, mas guarda-se na mesma: é por
  -- esta coluna que o motorista encontra os pedidos DELE sem ter de passar
  -- pelos fechos todos.
  "user_id" TEXT NOT NULL,

  "line" "SettlementLine" NOT NULL,
  -- O que ele escreveu, se escreveu. Opcional de propósito: obrigar a
  -- justificar uma dúvida é a melhor maneira de ninguém a levantar.
  "reason" TEXT,

  "status" "SettlementQueryStatus" NOT NULL DEFAULT 'ABERTO',

  -- A resposta: o texto e o extrato anexado.
  "answer"      TEXT,
  "file_url"    TEXT,
  "file_key"    TEXT,
  "answered_by_id" TEXT,
  "answered_at" TIMESTAMP(3),

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "settlement_queries_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_queries_fleet_id_fkey') THEN
    ALTER TABLE "settlement_queries" ADD CONSTRAINT "settlement_queries_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- O pedido morre com o fecho: sem a semana a que se refere, não quer dizer
  -- nada e não há como o responder.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_queries_settlement_fkey') THEN
    ALTER TABLE "settlement_queries" ADD CONSTRAINT "settlement_queries_settlement_fkey"
      FOREIGN KEY ("settlement_id") REFERENCES "weekly_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_queries_user_fkey') THEN
    ALTER TABLE "settlement_queries" ADD CONSTRAINT "settlement_queries_user_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- Quem respondeu pode sair da empresa; a resposta fica.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlement_queries_answered_by_fkey') THEN
    ALTER TABLE "settlement_queries" ADD CONSTRAINT "settlement_queries_answered_by_fkey"
      FOREIGN KEY ("answered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── UM PEDIDO ABERTO POR LINHA ─────────────────────────────────────────────
--
-- Índice único PARCIAL: só sobre os abertos. Impede o mesmo motorista de
-- encher a fila a carregar duas vezes no botão, e deixa na mesma voltar a
-- perguntar sobre a mesma linha depois de uma resposta — que é legítimo, por
-- exemplo quando o extrato veio e continua a não bater certo.
--
-- Um índice único sobre TODOS fechava essa segunda porta para sempre.
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_queries_abertos_key"
  ON "settlement_queries" ("settlement_id", "line")
  WHERE "status" = 'ABERTO';

CREATE INDEX IF NOT EXISTS "settlement_queries_fleet_idx"  ON "settlement_queries" ("fleet_id");
CREATE INDEX IF NOT EXISTS "settlement_queries_user_idx"   ON "settlement_queries" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "settlement_queries_status_idx" ON "settlement_queries" ("status", "created_at");
