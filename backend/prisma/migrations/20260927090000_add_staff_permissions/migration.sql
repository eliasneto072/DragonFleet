-- Permissões por pessoa e por área do painel.
--
-- ─── O QUE HAVIA ────────────────────────────────────────────────────────────
--
-- Três papéis fixos — ADMIN, MANAGER, SUPPORT — e duas listas escritas no
-- código a decidir o que cada um vê. Funcionava enquanto a equipa era o
-- Diogo. Deixa de funcionar assim que há alguém que só trata da faturação e
-- mais ninguém, ou alguém que só responde a tickets: o papel mais próximo dá
-- sempre acesso a mais do que devia, e a alternativa era inventar um papel
-- novo por cada pessoa.
--
-- ─── O QUE PASSA A HAVER ────────────────────────────────────────────────────
--
-- Uma linha por (pessoa, área) com três níveis: nenhum, ver, gerir. Dezasseis
-- áreas, uma por entrada do menu. O papel deixa de decidir o que se vê e passa
-- a ser apenas um ponto de partida.
--
-- ─── DUAS REGRAS QUE NÃO SE MEXEM ───────────────────────────────────────────
--
-- 1. O ADMIN tem tudo, sempre, e esta tabela é ignorada para ele. Sem isto,
--    uma configuração errada tranca o dono fora do próprio sistema e não há
--    ecrã nenhum por onde entrar para a corrigir.
--
-- 2. Sem linhas nenhumas, vale o comportamento antigo do papel. É o que faz
--    este deploy não mudar nada para ninguém no dia em que entra: quem hoje vê
--    o que vê continua a ver o mesmo até alguém decidir o contrário.

DO $$ BEGIN
  CREATE TYPE "StaffArea" AS ENUM (
    'DASHBOARD', 'DRIVERS', 'DOCUMENTS', 'FLEET', 'RANKS',
    'SETTLEMENTS', 'FINANCIAL', 'GREEN_RECEIPTS', 'ANALYTICS',
    'INVESTMENTS', 'INVESTORS', 'PROJECTS',
    'NOTIFICATIONS', 'SUPPORT', 'SETTINGS', 'TEAM'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- VIEW lê, MANAGE lê e escreve. NONE existe como valor explícito e não como
-- ausência de linha: "nunca foi configurado" e "foi expressamente tirado" são
-- coisas diferentes, e só a primeira deve cair no comportamento do papel.
DO $$ BEGIN
  CREATE TYPE "StaffAccess" AS ENUM ('NONE', 'VIEW', 'MANAGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "staff_permissions" (
  "id"      TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "area"    "StaffArea"   NOT NULL,
  "access"  "StaffAccess" NOT NULL DEFAULT 'NONE',

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT,

  -- CASCADE: apagar a pessoa apaga as permissões dela. Ao contrário do
  -- dinheiro, isto não é histórico que interesse guardar — são regras sobre
  -- uma conta que deixou de existir.
  CONSTRAINT "staff_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Uma linha por pessoa e área. Duas linhas para a mesma área deixavam o acesso
-- dependente da ordem de leitura, que é a forma mais silenciosa de uma
-- permissão falhar.
CREATE UNIQUE INDEX IF NOT EXISTS "staff_permissions_user_area_key"
  ON "staff_permissions" ("user_id", "area");
