-- O carregamento elétrico passa a ter coluna própria.
--
-- ─── PORQUE É QUE A DECISÃO ANTERIOR ESTAVA ERRADA ─────────────────────────
--
-- Guardei os dois no mesmo `fuel_amount` e separei-os nas estatísticas pelo
-- tipo do carro. Funciona enquanto um carro for só uma coisa. Parte-se num
-- HÍBRIDO, que abastece e carrega na mesma semana: os dois valores caíam na
-- mesma célula e nenhuma consulta os conseguia voltar a separar.
--
-- E parte-se outra vez no dia em que um carro mudar de elétrico para
-- combustível, ou for mal classificado: as semanas passadas mudavam de coluna
-- retroativamente, porque o que as classificava era o tipo ATUAL do veículo e
-- não o que foi gasto na altura.
--
-- Uma despesa não se deduz do carro. Grava-se onde foi escrita.
--
-- ─── ZERO E NÃO NULO ───────────────────────────────────────────────────────
--
-- Ao contrário dos quilómetros. Aqui o zero é a resposta certa para tudo o que
-- já existe: aquelas semanas não tiveram carregamento nenhum, e somá-las com
-- zero dá o total correto. Um NULL obrigava todas as somas a tratarem o caso,
-- sem dizer nada que o zero não diga.
--
-- Isto ENTRA nas despesas operacionais, ao lado do combustível — ver
-- `computeTotals`. As semanas já fechadas não mudam: têm zero aqui, e os
-- totais delas estão congelados nas suas próprias colunas.

ALTER TABLE "weekly_settlements"
  ADD COLUMN IF NOT EXISTS "charge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
