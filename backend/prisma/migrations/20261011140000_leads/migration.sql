-- Contactos deixados no site.
--
-- ─── PORQUE É QUE ESTA TABELA NÃO TEM `fleet_id` ────────────────────────────
--
-- É a única, com as frotas e os planos. Quem deixa o contacto no site ainda
-- não é de frota nenhuma: não tem conta, não tem sessão, e se for um gestor a
-- frota dele ainda não existe. É da plataforma, e está declarada como tal em
-- `MODELOS_GLOBAIS` (ver `src/config/escopo.ts`).
--
-- Não há dados a migrar. Todo o DDL é guardado: correr isto duas vezes dá o
-- mesmo resultado que correr uma.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadStatus') THEN
    CREATE TYPE "LeadStatus" AS ENUM ('NOVO', 'FALADO', 'GANHO', 'PERDIDO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeadTipo') THEN
    CREATE TYPE "LeadTipo" AS ENUM ('MOTORISTA', 'GESTOR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "leads" (
  "id"         TEXT NOT NULL,
  -- Por que porta entrou: "sou motorista" ou "sou gestor de frota". Muda tudo
  -- o que se diz a seguir ao telefone.
  "tipo"       "LeadTipo" NOT NULL,
  "name"       TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "email"      TEXT,
  "message"    TEXT,
  "status"     "LeadStatus" NOT NULL DEFAULT 'NOVO',
  "notes"      TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at"  TIMESTAMP(3),
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- A lista abre nos que ainda não foram contactados, por ordem de chegada.
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" ("status");
CREATE INDEX IF NOT EXISTS "leads_created_at_idx" ON "leads" ("created_at");
