-- Recuperar as atribuições que nunca foram escritas.
--
-- ─── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- O `create` do veículo gravava o `user_id` na linha do veículo e não abria
-- atribuição. A tabela `vehicle_assignments` só era escrita pelo endpoint de
-- atribuir. Portanto qualquer carro criado já com condutor, e nunca depois
-- reatribuído, tem o "Motorista atual" preenchido e o histórico vazio.
--
-- A consulta "quem teve o carro" responde "ninguém" nesses casos — sobre um
-- carro que teve condutor desde o primeiro dia. Como essa resposta serve para
-- imputar multas e sinistros a pessoas, um "ninguém" errado é pior do que não
-- haver resposta.
--
-- ─── O QUE ESTA MIGRAÇÃO PODE E NÃO PODE FAZER ───────────────────────────────
--
-- PODE: para cada veículo com condutor atual e SEM atribuição aberta, abrir uma
-- que começa na data de criação do veículo. É a data em que o carro entrou no
-- sistema já entregue a essa pessoa, e é a melhor aproximação que os dados
-- permitem.
--
-- NÃO PODE: recuperar condutores anteriores. Se um carro foi criado para o A e
-- depois atribuído ao B, o `assign` sobrescreveu `vehicles.user_id` com o B e o
-- período do A não está gravado em lado nenhum. Está perdido, e nenhuma
-- migração o traz de volta.
--
-- Por isso o `WHERE NOT EXISTS`: mexe apenas onde não há atribuição aberta.
-- Onde o endpoint de atribuir já foi usado, o histórico é o que é e não se
-- inventa nada por cima.
--
-- ─── SOBRE O FORMATO DO ID ───────────────────────────────────────────────────
--
-- As outras linhas desta tabela têm ids `cuid()`, gerados pelo cliente Prisma.
-- Em SQL não há forma de os gerar, e `gen_random_uuid()` é nativo no Postgres
-- desde a versão 13. As linhas recuperadas ficam com um id de formato
-- diferente — é uma inconsistência cosmética, e tem a vantagem de tornar
-- evidente quais foram derivadas e quais foram observadas.

INSERT INTO "vehicle_assignments" ("id", "vehicle_id", "user_id", "started_at", "ended_at")
SELECT
    gen_random_uuid()::text,
    v."id",
    v."user_id",
    v."created_at",
    NULL
FROM "vehicles" v
WHERE v."user_id" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "vehicle_assignments" a
      WHERE a."vehicle_id" = v."id"
        AND a."ended_at" IS NULL
  );
