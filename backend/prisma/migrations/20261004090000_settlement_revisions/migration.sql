-- Corrigir um fecho já creditado, sem apagar e recriar.
--
-- ─── O PROBLEMA ────────────────────────────────────────────────────────────
--
-- Um fecho com estado REGISTERED é dinheiro já creditado, e era imutável por
-- construção. A única forma de emendar uma vírgula trocada era cancelar e
-- criar outro — o que deixa o extrato do motorista com um estorno e um
-- lançamento novo, dois registos para explicar um engano.
--
-- ─── PORQUE É QUE ISTO NÃO É SÓ LEVANTAR A PROIBIÇÃO ───────────────────────
--
-- O saldo do motorista é a soma dos fechos registados. Editar um deles move o
-- dinheiro dele no mesmo instante, sem lançamento nenhum a dizê-lo. Feito em
-- silêncio, um saldo que muda sozinho é indistinguível de uma avaria.
--
-- Por isso a permissão vem com a obrigação: cada correção escreve uma linha em
-- `settlement_revisions`, com o motivo e o antes/depois de cada campo tocado,
-- e o motorista recebe uma notificação. É o registo que torna a edição
-- aceitável, não o contrário.
--
-- ─── A COLUNA NO FECHO ─────────────────────────────────────────────────────
--
-- `edited_after_register_at` é redundante em relação às revisões, e é de
-- propósito: é por ela que o filtro da lista pesquisa. Um filtro que tenha de
-- visitar outra tabela por cada linha fica lento sem ninguém reparar, e esta
-- lista cresce uma linha por motorista por semana, para sempre.
--
-- Fica NULA em tudo o que já existe, que é exatamente o que se quer dizer:
-- nunca foi corrigido depois de registado. Não se confunde com `updated_at`,
-- que mexe por tudo — incluindo pelo próprio ato de registar.

ALTER TABLE "weekly_settlements"
  ADD COLUMN IF NOT EXISTS "edited_after_register_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "weekly_settlements_edited_after_register_at_idx"
  ON "weekly_settlements" ("edited_after_register_at");

CREATE TABLE IF NOT EXISTS "settlement_revisions" (
  "id"             TEXT NOT NULL,
  "settlement_id"  TEXT NOT NULL,
  "edited_by_id"   TEXT,
  "reason"         TEXT NOT NULL,
  "status_at_edit" "SettlementStatus" NOT NULL,
  "changes"        JSONB NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "settlement_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "settlement_revisions_settlement_id_idx"
  ON "settlement_revisions" ("settlement_id");

CREATE INDEX IF NOT EXISTS "settlement_revisions_created_at_idx"
  ON "settlement_revisions" ("created_at");

-- O Postgres não tem ADD CONSTRAINT IF NOT EXISTS. Sem os blocos, correr a
-- migração numa base que já a tenha (uma restauração, um ambiente recriado)
-- rebentava.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_revisions_settlement_id_fkey'
  ) THEN
    ALTER TABLE "settlement_revisions"
      ADD CONSTRAINT "settlement_revisions_settlement_id_fkey"
      FOREIGN KEY ("settlement_id") REFERENCES "weekly_settlements"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- O autor é SET NULL e não CASCADE: apagar a conta de quem corrigiu não pode
  -- levar o rasto da correção com ela. Uma revisão sem autor conhecido é muito
  -- melhor do que nenhuma revisão.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_revisions_edited_by_id_fkey'
  ) THEN
    ALTER TABLE "settlement_revisions"
      ADD CONSTRAINT "settlement_revisions_edited_by_id_fkey"
      FOREIGN KEY ("edited_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
