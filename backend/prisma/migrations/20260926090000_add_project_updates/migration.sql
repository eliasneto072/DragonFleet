-- O diário de bordo de um projeto.
--
-- ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
--
-- Entre o dia em que o financiamento fecha e o dia em que o carro começa a
-- render passam semanas: o dinheiro entra na conta, paga-se o carro, trata-se
-- da documentação, da licença, do seguro, arranja-se motorista. Durante esse
-- tempo, o investidor tem 10 000 € parados num projeto que não distribui nada
-- e não tem nada para ver — e a ÚNICA forma de saber o que se passa é
-- telefonar.
--
-- É esse telefonema que isto substitui. Cada passo fica escrito, com data, em
-- ordem, e o investidor abre o projeto e vê onde as coisas estão.
--
-- ─── PORQUÊ UMA TABELA E NÃO UM CAMPO DE ESTADO ─────────────────────────────
--
-- Um campo "estado atual" responde a "onde está", mas não a "o que aconteceu"
-- nem "quando". E um projeto atrasado com o estado parado há três semanas não
-- se distingue de um que ninguém atualiza. Uma sequência de entradas com data
-- responde às três perguntas e mostra o ritmo — que é a informação que
-- tranquiliza ou preocupa, conforme o caso.
--
-- ─── AS ETAPAS SÃO UMA LISTA FECHADA, O TEXTO É LIVRE ───────────────────────
--
-- `stage` é um enum porque é o que permite desenhar uma escada de progresso e
-- dizer "vamos em 4 de 7". O título e o corpo são texto livre porque cada carro
-- tem a sua história, e obrigar tudo a caber num enum daria entradas vazias de
-- conteúdo. A etapa OTHER existe para o que não encaixa em nenhuma.

DO $$ BEGIN
  CREATE TYPE "ProjectUpdateStage" AS ENUM (
    'FUNDING_COMPLETE',  -- o financiamento fechou
    'FUNDS_RECEIVED',    -- o dinheiro está na conta da empresa
    'VEHICLE_PAID',      -- o carro foi pago
    'PAPERWORK',         -- registo, documentação, legalização
    'INSURANCE',         -- seguro tratado
    'TVDE_LICENSE',      -- licença TVDE / dístico
    'DRIVER_ASSIGNED',   -- entregue a um motorista
    'EARNING',           -- a render
    'MAINTENANCE',       -- oficina, revisão, avaria
    'INCIDENT',          -- acidente, multa, imprevisto
    'SALE',              -- vendido
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "project_updates" (
  "id"         TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,

  "stage" "ProjectUpdateStage" NOT NULL DEFAULT 'OTHER',
  "title" TEXT NOT NULL,
  "body"  TEXT,

  -- Fotografia: o carro à porta do stand, o papel da legalização. Uma imagem
  -- de um carro real vale mais do que três parágrafos a dizer que ele existe.
  "image_url" TEXT,

  -- O dia a que a entrada se refere, que não é necessariamente o dia em que
  -- foi escrita. O pagamento foi feito na sexta e registado na segunda: a
  -- linha do tempo tem de o mostrar na sexta.
  "happened_on" DATE NOT NULL,

  -- Visível ao investidor. Falso deixa a entrada só para uso interno — por
  -- exemplo uma nota sobre uma negociação que ainda não está fechada.
  "visible" BOOLEAN NOT NULL DEFAULT true,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,

  CONSTRAINT "project_updates_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "investment_projects"("id") ON DELETE CASCADE
);

-- A ordem de leitura é sempre a mesma: por dia, do mais recente para o mais
-- antigo. O índice serve exatamente essa consulta.
CREATE INDEX IF NOT EXISTS "project_updates_project_happened_idx"
  ON "project_updates" ("project_id", "happened_on" DESC);
