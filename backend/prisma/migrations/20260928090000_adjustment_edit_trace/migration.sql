-- Rasto de edição nos ajustes de saldo.
--
-- A data de um ajuste passa a poder ser corrigida pelo painel — um saldo de
-- abertura lançado depois dos primeiros fechos aparece no meio do extrato, e
-- todos os saldos corridos anteriores ficam sem sentido. Até aqui isso
-- resolvia-se com um UPDATE à mão na base de dados de produção, que não deixa
-- rasto nenhum.
--
-- Corrigir sem registar seria trocar um problema por outro pior: daqui a seis
-- meses ninguém saberia se aquela data é a original ou se alguém lhe mexeu.
-- Duas colunas resolvem-no, e ficam nulas em tudo o que já existe — que é
-- precisamente o que se quer dizer: nunca foi editado.

ALTER TABLE "balance_adjustments"
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "edited_by" TEXT;

-- O Postgres não tem ADD CONSTRAINT IF NOT EXISTS. Sem o bloco, correr a
-- migração numa base que já a tenha (uma restauração, um ambiente recriado)
-- rebentava.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'balance_adjustments_edited_by_fkey'
  ) THEN
    ALTER TABLE "balance_adjustments"
      ADD CONSTRAINT "balance_adjustments_edited_by_fkey"
      FOREIGN KEY ("edited_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
