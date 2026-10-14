-- Os créditos pessoais.
--
-- ─── O QUE SE GUARDA E O QUE SE CALCULA ─────────────────────────────────────
--
-- Guarda-se o que está no CONTRATO: capital, TAN, TAEG, MTIC, número de
-- prestações, data da primeira, e a prestação que sai todos os meses.
--
-- Não se guarda nada do que se calcula a partir disso — quanto já foi pago,
-- quanto falta, quanto foram juros. Essas contas vivem em `creditos.ts`, são
-- feitas na hora e estão testadas. Guardadas, ficavam desactualizadas no dia
-- seguinte e seria preciso um trabalho noturno a refazê-las; e um número
-- guardado que diverge do que a fórmula diz é uma avaria que não se encontra.
--
-- ─── AS TRÊS TAXAS NÃO SÃO A MESMA COISA ────────────────────────────────────
--
-- TAN   corre sobre o capital em dívida. É a única que entra no quadro de
--       amortização, porque é a única que descreve como a dívida é consumida.
-- TAEG  inclui comissões, seguros e imposto de selo. Serve para comparar
--       propostas de bancos diferentes. No quadro, atribuía ao capital
--       encargos que não são juro do capital.
-- MTIC  o total que se acaba por entregar, do papel. Não se calcula: lê-se.
--       Guardado para se poder confrontar com o que as contas dizem — se os
--       dois não baterem, há encargos que nenhuma destas contas conhece.
--
-- Todas as taxas em DECIMAL(6,3): 5,400 chega para qualquer TAEG de consumo e
-- as três casas evitam que 5,4% e 5,45% virem o mesmo número.
--
-- Não há dados a migrar. Todo o DDL é guardado: correr isto duas vezes dá o
-- mesmo resultado que correr uma.

CREATE TABLE IF NOT EXISTS "credits" (
  "id"       TEXT NOT NULL,
  "fleet_id" TEXT NOT NULL DEFAULT '',
  "user_id"  TEXT NOT NULL,

  -- Como lhe chamas. "Consolidação", "Carro", "Mário".
  "name"     TEXT NOT NULL,
  -- A quem se deve. Texto livre: há créditos que não são de bancos.
  "lender"   TEXT,

  -- Capital emprestado.
  "principal" DECIMAL(12,2) NOT NULL,

  -- A primeira prestação. As seguintes andam de mês a mês a partir daqui, por
  -- isso não se guarda a data do fim: calcula-se, e assim nunca pode estar em
  -- desacordo com o número de prestações.
  "started_on"  DATE NOT NULL,
  "installments" INTEGER NOT NULL,

  -- A prestação que sai de facto todos os meses.
  --
  -- Guardada apesar de se poder calcular, e de propósito: é o número que ele
  -- sabe de cor, e é com ele que se confere se o resto está bem copiado do
  -- contrato. Se a nossa conta der outra coisa, há um engano algures — e mais
  -- vale dizê-lo do que mostrar um gráfico convincente e falso.
  "monthly_payment" DECIMAL(12,2),

  "tan"  DECIMAL(6,3) NOT NULL DEFAULT 0,
  "taeg" DECIMAL(6,3),
  "mtic" DECIMAL(12,2),

  "notes" TEXT,

  -- Liquidado antes do fim (amortização total, consolidação noutro crédito).
  -- Nulo é o caso normal: ainda está a correr.
  "closed_on" DATE,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credits_fleet_id_fkey') THEN
    ALTER TABLE "credits" ADD CONSTRAINT "credits_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credits_user_id_fkey') THEN
    ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Um crédito tem de ter prestações. Zero dá uma divisão por zero na
-- percentagem paga, e a guarda certa para isso é a base de dados e não uma
-- lembrança de quem escreve o formulário.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credits_installments_positive') THEN
    ALTER TABLE "credits" ADD CONSTRAINT "credits_installments_positive"
      CHECK ("installments" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credits_principal_positive') THEN
    ALTER TABLE "credits" ADD CONSTRAINT "credits_principal_positive"
      CHECK ("principal" > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "credits_fleet_id_idx" ON "credits" ("fleet_id");
CREATE INDEX IF NOT EXISTS "credits_user_idx"     ON "credits" ("user_id", "started_on");
