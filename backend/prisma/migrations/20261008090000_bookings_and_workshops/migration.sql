-- Marcações de oficina, com conta própria para o mecânico.
--
-- ═══ O QUE ISTO RESOLVE ════════════════════════════════════════════════════
--
-- Uma troca de óleo combinava-se por telefone e vivia na cabeça de alguém. O
-- motorista sabia que ia à oficina na terça; a oficina sabia que esperava um
-- carro; e quando as duas versões não batiam certo, o carro ficava parado um
-- dia — que numa frota de TVDE é o dia inteiro de faturação daquele carro.
--
-- Agora a marcação é um registo: o que é, onde, quando, quem leva o carro, e
-- quanto custou no fim.
--
-- ═══ A CONTA DE MECÂNICO ═══════════════════════════════════════════════════
--
-- `MECHANIC` é um perfil novo e, como o investidor, é alguém de FORA da
-- empresa. Não pode ver fechos, saldos, motoristas nem documentos — e o
-- bloqueio não é esconder menus no site: é o servidor recusar tudo o que não
-- seja o portal da oficina.
--
-- O mecânico pertence a UMA oficina (`users.workshop_id`) e vê só as marcações
-- dela. Um mecânico sem oficina não vê nada, de propósito: vale mais uma conta
-- que não mostra nada do que uma que mostra a frota toda.
--
-- ═══ PORQUE É QUE O MOTORISTA FICA GRAVADO NA MARCAÇÃO ═════════════════════
--
-- `bookings.driver_id` é escrito quando a marcação nasce, a partir de quem tem
-- o carro nessa altura, e não lido da atribuição na hora de mostrar. Se o
-- carro mudar de mãos entretanto, a marcação continua a dizer quem a tinha de
-- cumprir — que é a pergunta que se faz quando alguém não apareceu.
--
-- ═══ next_inspection_on ════════════════════════════════════════════════════
--
-- Fica no veículo e não deduzida da última inspeção feita: um carro pode
-- entrar na frota já inspecionado, e a data vem do papel. Nula NÃO quer dizer
-- "está em dia" — quer dizer "não se sabe", e é isso que o aviso diz.

-- ── Perfil novo ────────────────────────────────────────────────────────────
--
-- O Postgres não tem ADD VALUE IF NOT EXISTS antes da 12, e mesmo depois não
-- corre dentro de um bloco com outras instruções. Daí o DO próprio.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'MECHANIC'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'MECHANIC';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingStatus') THEN
    CREATE TYPE "BookingStatus" AS ENUM (
      'PENDENTE', 'NOVA_DATA_PROPOSTA', 'CONFIRMADA', 'CONCLUIDA', 'CANCELADA', 'RECUSADA'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingLogistics') THEN
    CREATE TYPE "BookingLogistics" AS ENUM (
      'MOTORISTA_LEVA', 'OFICINA_RECOLHE', 'EMPRESA_LEVA'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BookingFileKind') THEN
    CREATE TYPE "BookingFileKind" AS ENUM ('FATURA', 'COMPROVATIVO', 'OUTRO');
  END IF;
END $$;

-- ── Oficinas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "workshops" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "kind"       TEXT NOT NULL DEFAULT 'OFICINA',
  "address"    TEXT,
  "phone"      TEXT,
  "notes"      TEXT,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workshops_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workshops_active_idx" ON "workshops" ("active");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "workshop_id" TEXT;

-- ── Tipos de serviço ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "service_types" (
  "id"            TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "is_inspection" BOOLEAN NOT NULL DEFAULT false,
  "active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_types_label_key" ON "service_types" ("label");

-- ── Marcações ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bookings" (
  "id"               TEXT NOT NULL,
  "vehicle_id"       TEXT NOT NULL,
  "driver_id"        TEXT,
  "workshop_id"      TEXT NOT NULL,
  "service_type_id"  TEXT NOT NULL,
  "description"      TEXT,
  "scheduled_at"     TIMESTAMP(3) NOT NULL,
  "proposed_at"      TIMESTAMP(3),
  "proposal_reason"  TEXT,
  "status"           "BookingStatus" NOT NULL DEFAULT 'PENDENTE',
  "logistics"        "BookingLogistics" NOT NULL DEFAULT 'MOTORISTA_LEVA',
  "needs_escort"     BOOLEAN NOT NULL DEFAULT false,
  "escort_id"        TEXT,
  "cost"             DECIMAL(12,2),
  "completion_notes" TEXT,
  "completed_at"     TIMESTAMP(3),
  "cancel_reason"    TEXT,
  "created_by_id"    TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bookings_vehicle_id_idx" ON "bookings" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "bookings_driver_id_idx"  ON "bookings" ("driver_id");
-- A pergunta do portal da oficina: o que tenho por confirmar, e para quando.
CREATE INDEX IF NOT EXISTS "bookings_workshop_id_status_idx" ON "bookings" ("workshop_id", "status");
CREATE INDEX IF NOT EXISTS "bookings_scheduled_at_idx" ON "bookings" ("scheduled_at");

-- ── Factura e comprovativo ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "booking_files" (
  "id"             TEXT NOT NULL,
  "booking_id"     TEXT NOT NULL,
  "kind"           "BookingFileKind" NOT NULL,
  "file_url"       TEXT NOT NULL,
  "file_key"       TEXT NOT NULL,
  "file_name"      TEXT,
  "uploaded_by_id" TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "booking_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "booking_files_booking_id_idx" ON "booking_files" ("booking_id");

-- ── A data da próxima inspeção ─────────────────────────────────────────────
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "next_inspection_on" DATE;

-- ── As chaves estrangeiras ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_workshop_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_workshop_id_fkey"
      FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_vehicle_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  -- SET NULL e não CASCADE: apagar a conta de um motorista que saiu não pode
  -- levar com ela o histórico de reparações do carro.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_driver_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_fkey"
      FOREIGN KEY ("driver_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_escort_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_escort_id_fkey"
      FOREIGN KEY ("escort_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_workshop_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workshop_id_fkey"
      FOREIGN KEY ("workshop_id") REFERENCES "workshops"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_service_type_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_type_id_fkey"
      FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_created_by_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_files_booking_id_fkey') THEN
    ALTER TABLE "booking_files" ADD CONSTRAINT "booking_files_booking_id_fkey"
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_files_uploaded_by_id_fkey') THEN
    ALTER TABLE "booking_files" ADD CONSTRAINT "booking_files_uploaded_by_id_fkey"
      FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Tipos de serviço para a lista não começar vazia. São um ponto de partida e
-- podem ser desligados ou renomeados no painel.
INSERT INTO "service_types" ("id", "label", "is_inspection") VALUES
  ('seed_st_revisao',   'Revisão / manutenção',  false),
  ('seed_st_oleo',      'Troca de óleo',         false),
  ('seed_st_pneus',     'Pneus',                 false),
  ('seed_st_furo',      'Furo',                  false),
  ('seed_st_travoes',   'Travões',               false),
  ('seed_st_inspecao',  'Inspeção periódica',    true),
  ('seed_st_avaria',    'Avaria',                false),
  ('seed_st_chapa',     'Chapa e pintura',       false),
  ('seed_st_outro',     'Outro',                 false)
ON CONFLICT ("label") DO NOTHING;
