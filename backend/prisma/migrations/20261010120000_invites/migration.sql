-- Convites: o link por onde um motorista entra numa frota.
--
-- ─── O QUE ESTA MIGRAÇÃO SUBSTITUI ──────────────────────────────────────────
--
-- O registo aberto. Até aqui, quem abrisse /register era inscrito na única
-- frota do sistema; com várias, não havia forma de saber em qual. Daqui para a
-- frente a frota vem dentro do link, e sem link não há registo.
--
-- Não há dados a migrar: não existe nenhum convite para criar, e as contas que
-- já existem não precisam de um. É uma tabela nova e mais nada.
--
-- ─── TODO O DDL É GUARDADO ──────────────────────────────────────────────────
--
-- `IF NOT EXISTS` em tudo, e a chave estrangeira dentro de um DO que confere o
-- pg_constraint antes de a criar. Correr isto duas vezes dá o mesmo resultado
-- que correr uma — que é o que torna seguro voltar a aplicar depois de um
-- deploy interrompido a meio.

CREATE TABLE IF NOT EXISTS "invites" (
  "id"          TEXT NOT NULL,
  "fleet_id"    TEXT NOT NULL DEFAULT '',
  "code"        TEXT NOT NULL,
  "label"       TEXT,
  "expires_on"  DATE,
  "max_uses"    INTEGER,
  -- Quantos faltam. Nulo = sem limite. É esta a coluna da trava: compara-se
  -- com zero, que é um número escrito, e por isso o UPDATE que a decrementa
  -- consegue ser atómico. Ver a nota no `schema.prisma`.
  "remaining"   INTEGER,
  "uses"        INTEGER NOT NULL DEFAULT 0,
  "revoked_at"  TIMESTAMP(3),
  "created_by"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- Único no sistema INTEIRO e não por frota: é pelo código que se descobre a
-- frota, antes de haver sessão. Dois códigos iguais em frotas diferentes
-- tornavam essa pergunta impossível de responder.
CREATE UNIQUE INDEX IF NOT EXISTS "invites_code_key" ON "invites" ("code");

CREATE INDEX IF NOT EXISTS "invites_fleet_id_idx" ON "invites" ("fleet_id");

-- A chave estrangeira é o que faz o `fleet_id` vazio por omissão ser seguro:
-- '' não é o id de nenhuma frota, por isso uma escrita que escape à camada do
-- âmbito rebenta aqui em vez de aterrar em silêncio na frota do dono.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invites_fleet_id_fkey'
  ) THEN
    ALTER TABLE "invites"
      ADD CONSTRAINT "invites_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
