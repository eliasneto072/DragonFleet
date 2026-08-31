-- Sociedades a quem o recibo verde é emitido, e a classificação de cada retirada.
--
-- Aditiva: cria uma tabela e acrescenta colunas. Nada é reescrito.
--
-- POR QUE UMA TABELA E NÃO UM ENUM: a lista de sociedades muda — criam-se,
-- mudam de nome, dissolvem-se. Um enum obrigaria a uma migração de cada vez.
-- E as retiradas guardam o id, não o nome, portanto renomear uma sociedade
-- não reescreve o histórico: continua a ser a mesma entidade jurídica.
--
-- ON DELETE SET NULL na chave estrangeira, de propósito. Apagar uma sociedade
-- não pode arrastar retiradas: o dinheiro saiu, o recibo existe, e perder o
-- registo por causa de uma limpeza de tabela seria o pior resultado possível.
-- A coluna `active` existe precisamente para não ser preciso apagar.
--
-- TRÊS ESTADOS possíveis na classificação, e a diferença importa:
--   company_id preenchido            → emitido a uma sociedade da lista
--   company_other preenchido         → emitido a outra, escrita à mão
--   ambos nulos, company_set_at NÃO  → "Nenhum", escolha deliberada
--   ambos nulos, company_set_at nulo → por classificar (anterior a esta migração)
-- Sem a coluna company_set_at, os dois últimos casos seriam indistinguíveis e
-- o registo não saberia dizer o que falta preencher.

CREATE TABLE "companies" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "withdrawals" ADD COLUMN "company_id"        TEXT;
ALTER TABLE "withdrawals" ADD COLUMN "company_other"     TEXT;
ALTER TABLE "withdrawals" ADD COLUMN "company_set_by_id" TEXT;
ALTER TABLE "withdrawals" ADD COLUMN "company_set_at"    TIMESTAMP(3);

ALTER TABLE "withdrawals"
  ADD CONSTRAINT "withdrawals_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A tela de Recibos Verdes filtra por sociedade e ordena por data.
CREATE INDEX "withdrawals_company_id_idx" ON "withdrawals"("company_id");

-- As duas sociedades que o cliente nomeou. A terceira ficou por nomear na
-- mensagem dele — "TERCEIRA EMPRESA" é um marcador de lugar, não um nome, e
-- entrar assim na base deixava lixo que ninguém corrigiria depois. Acrescenta-se
-- pela tela quando ele souber o nome.
INSERT INTO "companies" ("id", "name", "sort_order", "updated_at") VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Chromatic Dragon Unipessoal Lda', 1, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000002', 'Renas e Elfos',                   2, CURRENT_TIMESTAMP);
