-- Até três contas bancárias por motorista, e a retirada escolhe uma.
--
-- ─── PORQUE É QUE ISTO MUDA ─────────────────────────────────────────────────
--
-- Havia uma conta por motorista, e o IBAN da retirada era simplesmente "o que
-- estiver em vigor". Quem tem a conta ordenado e outra onde recebe o TVDE
-- tinha de andar a trocar o IBAN a cada pedido — e cada troca passava pela
-- aprovação outra vez.
--
-- Três é um teto pensado, não um número redondo: cobre o caso real (conta
-- pessoal, conta do negócio, conta de um familiar com procuração) e trava o
-- que interessa travar, que é alguém encher a conta de IBANs e a administração
-- deixar de saber para onde está a pagar.
--
-- ─── O QUE NÃO MUDA ─────────────────────────────────────────────────────────
--
-- Cada conta continua a ter o mesmo ciclo: submete-se com comprovativo, fica
-- pendente, e só depois de aprovada pode receber dinheiro. A alteração é do
-- NÚMERO de contas, não da confiança que se põe em cada uma.
--
-- E a retirada continua a congelar o IBAN no momento da aprovação. Agora
-- guarda também QUAL a conta escolhida, para a tela do administrador poder
-- mostrar o nome que o motorista lhe deu ("Millennium", "conta da empresa")
-- em vez de vinte e cinco dígitos.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Deixar de haver uma só
-- ═══════════════════════════════════════════════════════════════════════════

-- As duas formas: o Prisma tanto cria a unicidade como CONSTRAINT (e aí o
-- DROP INDEX não lhe toca) como com CREATE UNIQUE INDEX (e aí o DROP
-- CONSTRAINT não a encontra). Qual delas está lá depende da versão que gerou a
-- migração original, por isso tentam-se as duas — a que não existir não faz
-- nada, e o que não pode acontecer é isto correr e o índice ficar de pé.
ALTER TABLE "bank_accounts" DROP CONSTRAINT IF EXISTS "bank_accounts_user_id_key";
DROP INDEX IF EXISTS "bank_accounts_user_id_key";

CREATE INDEX IF NOT EXISTS "bank_accounts_user_id_idx" ON "bank_accounts" ("user_id");

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. As colunas novas
-- ═══════════════════════════════════════════════════════════════════════════

-- O nome que o motorista dá à conta. Sem isto, três IBANs numa lista são três
-- filas de dígitos e ninguém sabe qual é qual.
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "label" TEXT;

-- A conta por omissão: a que vem escolhida no pedido de retirada.
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- Arquivar e não apagar. Uma conta que já recebeu dinheiro faz parte do
-- histórico: apagá-la deixava retiradas antigas a apontar para o nada.
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. As contas que já existem passam a principais
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cada motorista tinha no máximo uma, portanto isto não pode criar duas
-- principais. Sem este passo, ninguém ficaria com conta por omissão e o
-- primeiro pedido de retirada de toda a gente aparecia sem nada escolhido.

UPDATE "bank_accounts"
   SET "is_primary" = true,
       "label" = COALESCE("label", 'Conta principal')
 WHERE "archived_at" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. As regras que a base garante sozinha
-- ═══════════════════════════════════════════════════════════════════════════

-- Uma principal por motorista. Índice PARCIAL: só conta as ativas e só as
-- marcadas como principal, portanto as outras duas contas convivem à vontade.
--
-- Vale a pena estar aqui e não só no serviço: "definir esta como principal"
-- são duas escritas (tirar a antiga, pôr a nova) e dois pedidos ao mesmo tempo
-- podiam deixar duas. Com isto, a segunda transação rebenta em vez de passar.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_one_primary_per_user"
  ON "bank_accounts" ("user_id")
  WHERE "is_primary" AND "archived_at" IS NULL;

-- O mesmo IBAN duas vezes na mesma pessoa não é um erro grave, mas é ruído
-- garantido na hora de escolher para onde pagar.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_accounts_user_iban_key"
  ON "bank_accounts" ("user_id", "iban")
  WHERE "iban" IS NOT NULL AND "archived_at" IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. A retirada passa a saber que conta foi escolhida
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SET NULL e não CASCADE: arquivar ou apagar uma conta nunca pode levar por à
-- frente o registo de uma retirada. O `paid_to_iban`, que é o que interessa
-- para a contabilidade, está copiado na própria retirada e não depende desta
-- ligação.

ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "bank_account_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "withdrawals"
    ADD CONSTRAINT "withdrawals_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "withdrawals_bank_account_id_idx"
  ON "withdrawals" ("bank_account_id");
