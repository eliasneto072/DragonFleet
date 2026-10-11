-- Pedidos de plano: um cliente a pedir mais do que aquilo que contratou.
--
-- ─── PORQUE É QUE ISTO NÃO SÃO TICKETS DE SUPORTE ───────────────────────────
--
-- Porque os tickets vivem dentro de uma frota, e um ticket aberto na frota do
-- cliente cai na caixa de suporte DELE — que é precisamente quem não o pode
-- resolver. Isto tem de chegar ao dono da plataforma, que está fora daquela
-- frota. Daí uma tabela própria, lida em modo de dono.
--
-- Não há dados a migrar: é uma tabela nova e mais nada.
--
-- Todo o DDL é guardado (`IF NOT EXISTS`, e o tipo e as chaves dentro de um DO
-- que confere o catálogo antes de criar). Correr isto duas vezes dá o mesmo
-- resultado que correr uma.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanRequestStatus') THEN
    CREATE TYPE "PlanRequestStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "plan_requests" (
  "id"                TEXT NOT NULL,
  "fleet_id"          TEXT NOT NULL DEFAULT '',
  -- Nulo quer dizer "personalizado": o cliente não quer nenhum dos planos à
  -- venda e escreveu o que precisa.
  "plan_id"           TEXT,
  "message"           TEXT,
  "status"            "PlanRequestStatus" NOT NULL DEFAULT 'OPEN',
  "requested_by"      TEXT,
  "requested_by_name" TEXT,
  "resolution"        TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at"       TIMESTAMP(3),
  CONSTRAINT "plan_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "plan_requests_fleet_id_idx" ON "plan_requests" ("fleet_id");
-- A lista do painel do dono abre nos que estão por responder.
CREATE INDEX IF NOT EXISTS "plan_requests_status_idx" ON "plan_requests" ("status");

-- A chave estrangeira da frota é o que faz o `fleet_id` vazio por omissão ser
-- seguro: '' não é o id de nenhuma frota, por isso uma escrita que escape à
-- camada do âmbito rebenta aqui em vez de aterrar em silêncio noutro sítio.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plan_requests_fleet_id_fkey'
  ) THEN
    ALTER TABLE "plan_requests"
      ADD CONSTRAINT "plan_requests_fleet_id_fkey"
      FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  -- SET NULL e não RESTRICT: um plano arquivado e depois apagado não deve
  -- impedir de ler o histórico de quem o pediu. O pedido fica, sem o plano.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plan_requests_plan_id_fkey'
  ) THEN
    ALTER TABLE "plan_requests"
      ADD CONSTRAINT "plan_requests_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
