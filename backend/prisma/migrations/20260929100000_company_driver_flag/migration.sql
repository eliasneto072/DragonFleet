-- "Este motorista é a empresa."
--
-- ─── O QUE ISTO RESOLVE ────────────────────────────────────────────────────
--
-- O dono da frota também conduz. Quando ele conduz, o dinheiro da semana já é
-- da empresa — não é um motorista a ser pago. E o aluguer da viatura que lhe é
-- lançado é a empresa a cobrar a si própria: contá-lo como lucro inventava
-- receita que não existe.
--
-- Regra do cliente, nas palavras dele:
--   "lucro da empresa = valor de carros de todos menos eu
--                     + valor do fecho da semana meu apenas"
--
-- ─── PORQUE É UMA MARCA E NÃO UM NOME NO CÓDIGO ────────────────────────────
--
-- Escrever "Diogo Isaias" numa consulta funcionava hoje e partia-se em
-- silêncio no dia em que ele mudasse o nome, criasse uma segunda conta, ou
-- pusesse outro gestor a conduzir. Ninguém repararia: as contas continuariam a
-- dar um número, só que errado.
--
-- Com uma marca na ficha, quem manda é o painel, e podem ser vários.
--
-- Nasce FALSE em toda a gente de propósito: antes de alguém a ligar, as
-- estatísticas comportam-se como se a regra não existisse, em vez de
-- adivinharem quem é o dono.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_company" BOOLEAN NOT NULL DEFAULT false;

-- As estatísticas separam sempre os dois grupos; sem isto era uma varredura à
-- tabela inteira a cada cálculo. Parcial porque a esmagadora maioria é false.
CREATE INDEX IF NOT EXISTS "users_is_company_idx"
  ON "users" ("is_company") WHERE "is_company" = true;
