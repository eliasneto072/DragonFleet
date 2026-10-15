-- Liga cada lançamento ao agendamento que o gerou.
--
-- ─── PORQUE É PRECISO ───────────────────────────────────────────────────────
--
-- Para somar o gasto por categoria. Hoje não há forma de o fazer com verdade:
-- o lançamento que o robô cria é um ajuste de saldo como outro qualquer, sem
-- rasto nenhum de onde veio. A única conta possível era
-- `runCount × amount` — e essa parte-se no momento em que alguém edita o valor
-- do agendamento, que é exactamente a funcionalidade que vem a seguir.
--
-- Com a ligação escrita, o total por categoria sai dos movimentos REAIS: cada
-- um com o valor que tinha no dia em que saiu, e não com o valor de hoje.
--
-- ─── E SERVE PARA MAIS DO QUE AS SOMAS ──────────────────────────────────────
--
-- Serve para o motorista. No extrato dele, um débito de 15 € que diz só
-- "Seguro" é indistinguível de um lançado à mão. Com a ligação, o ecrã pode
-- dizer de onde veio, e ele deixa de ter de perguntar.
--
-- ─── PORQUE É NULO E PORQUE É SET NULL ──────────────────────────────────────
--
-- Nulo porque a esmagadora maioria dos ajustes não vem de agendamento nenhum:
-- são lançamentos da administração, e isso é o normal, não uma falha.
--
-- SET NULL porque apagar um agendamento não pode apagar o dinheiro que já
-- saiu. O movimento fica, perde a origem, e o extrato do motorista continua
-- certo — que é a única coisa que não pode mudar.

SET LOCAL lock_timeout = '10s';

ALTER TABLE "balance_adjustments"
  ADD COLUMN IF NOT EXISTS "scheduled_payment_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'balance_adjustments_scheduled_payment_fkey'
  ) THEN
    ALTER TABLE "balance_adjustments"
      ADD CONSTRAINT "balance_adjustments_scheduled_payment_fkey"
      FOREIGN KEY ("scheduled_payment_id")
      REFERENCES "scheduled_payments"("id")
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

-- A pergunta que o resumo faz é sempre «os lançamentos DESTE agendamento».
CREATE INDEX IF NOT EXISTS "balance_adjustments_scheduled_idx"
  ON "balance_adjustments" ("scheduled_payment_id");
