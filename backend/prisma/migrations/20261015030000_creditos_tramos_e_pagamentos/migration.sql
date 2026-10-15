-- Créditos: tramos de prestação, capital a pagar no final, e pagamentos.
--
-- ─── O QUE MUDA, E PORQUÊ ───────────────────────────────────────────────────
--
-- 1. CAPITAL A PAGAR NO FINAL
--
--    Até aqui o juro era deduzido da TAN. Mas ele tem créditos que não são de
--    bancos — investidores particulares, com condições próprias e às vezes
--    SEM JUROS NENHUNS. Num contrato desses não há TAN: há o que se pediu e o
--    que se devolve. A diferença entre os dois É o juro, e não precisa de
--    taxa nenhuma para se saber.
--
-- 2. TRAMOS DE PRESTAÇÃO
--
--    «Nos 12 primeiros meses a prestação é 200, nos 12 seguintes é 300.» Uma
--    prestação única não consegue representar isso, e forçá-la dava um plano
--    que não é o do contrato. Cada tramo diz a partir de que prestação passa
--    a valer; o último estende-se até ao fim.
--
-- 3. PAGAMENTOS REGISTADOS
--
--    A percentagem paga era contada pelos meses decorridos. Isso assume que se
--    pagou sempre a horas — e não é o caso dele: um dos extratos mostra uma
--    prestação em atraso. Contado pela data, um crédito em incumprimento
--    aparece como se estivesse em dia, que é precisamente a informação que ele
--    quer ter à frente dos olhos.
--
--    Passa a haver pagamentos a sério. A barra, a reta acumulada e o «quanto
--    falta» saem deles.
--
-- 4. A TAN E A TAEG PASSAM A SER OPCIONAIS
--
--    A coluna `tan` tinha `DEFAULT 0 NOT NULL`, e um zero não distingue «sem
--    juros» de «não preenchi». Passa a aceitar nulo. Os zeros que lá estão
--    FICAM como zero — não se adivinha o que eles queriam dizer.
--
-- Todo o DDL é guardado: correr isto duas vezes dá o mesmo que correr uma.

SET LOCAL lock_timeout = '10s';

-- ─── CAPITAL A PAGAR NO FINAL ───────────────────────────────────────────────

ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "total_to_pay" DECIMAL(12,2);

-- A TAN deixa de ser obrigatória. O `DROP NOT NULL` é idempotente por
-- natureza: numa coluna que já aceita nulos não faz nada.
ALTER TABLE "credits" ALTER COLUMN "tan" DROP NOT NULL;
ALTER TABLE "credits" ALTER COLUMN "tan" DROP DEFAULT;

-- O que se devolve não pode ser menos do que o que se pediu. Um valor abaixo
-- do capital seria um juro negativo — quase sempre um dígito a menos ao
-- escrever, e um erro que passa despercebido porque o número continua a
-- parecer dinheiro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credits_total_nao_e_menor') THEN
    ALTER TABLE "credits" ADD CONSTRAINT "credits_total_nao_e_menor"
      CHECK ("total_to_pay" IS NULL OR "total_to_pay" >= "principal");
  END IF;
END $$;

-- ─── TRAMOS DE PRESTAÇÃO ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_tranches" (
  "id"        TEXT NOT NULL,
  "fleet_id"  TEXT NOT NULL DEFAULT '',
  "credit_id" TEXT NOT NULL,

  -- A partir de que prestação este valor passa a valer. 1 é a primeira.
  -- Guarda-se o INÍCIO e não o intervalo: assim os tramos não podem deixar
  -- buracos nem sobrepor-se, que é o que acontece quando se guardam os dois
  -- extremos e alguém mexe num.
  "from_installment" INTEGER NOT NULL,
  "amount"           DECIMAL(12,2) NOT NULL,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_tranches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_tranches_credit_from_key"
  ON "credit_tranches" ("credit_id", "from_installment");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_tranches_from_positivo') THEN
    ALTER TABLE "credit_tranches" ADD CONSTRAINT "credit_tranches_from_positivo"
      CHECK ("from_installment" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_tranches_amount_positivo') THEN
    ALTER TABLE "credit_tranches" ADD CONSTRAINT "credit_tranches_amount_positivo"
      CHECK ("amount" > 0);
  END IF;
END $$;

-- ─── PAGAMENTOS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "credit_payments" (
  "id"        TEXT NOT NULL,
  "fleet_id"  TEXT NOT NULL DEFAULT '',
  "credit_id" TEXT NOT NULL,

  "paid_on" DATE NOT NULL,
  "amount"  DECIMAL(12,2) NOT NULL,
  "notes"   TEXT,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_payments_amount_positivo') THEN
    ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_amount_positivo"
      CHECK ("amount" > 0);
  END IF;
END $$;

-- ─── CHAVES ESTRANGEIRAS ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_tranches_fleet_id_fkey') THEN
    ALTER TABLE "credit_tranches" ADD CONSTRAINT "credit_tranches_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  -- Os tramos e os pagamentos morrem com o crédito: sem ele não querem dizer
  -- nada e não há por onde lá chegar.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_tranches_credit_fkey') THEN
    ALTER TABLE "credit_tranches" ADD CONSTRAINT "credit_tranches_credit_fkey"
      FOREIGN KEY ("credit_id") REFERENCES "credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_payments_fleet_id_fkey') THEN
    ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_payments_credit_fkey') THEN
    ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_credit_fkey"
      FOREIGN KEY ("credit_id") REFERENCES "credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "credit_tranches_credit_idx" ON "credit_tranches" ("credit_id", "from_installment");
CREATE INDEX IF NOT EXISTS "credit_payments_credit_idx" ON "credit_payments" ("credit_id", "paid_on");
CREATE INDEX IF NOT EXISTS "credit_payments_fleet_idx"  ON "credit_payments" ("fleet_id", "paid_on");
