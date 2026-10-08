-- Inventário de material: o que há em stock, o que se gastou, e o que custou.
--
-- ═══ O QUE ISTO ACRESCENTA ═════════════════════════════════════════════════
--
--   materials    — a coisa em si: óleo, filtros, pastilhas, pneus. Guarda o
--                  stock de agora (`qty`) e o custo médio ponderado
--                  (`avg_cost`).
--   stock_moves  — como se chegou a esse stock: compras, consumos, e ajustes
--                  de contagem. Cada movimento leva o custo gravado.
--
-- ═══ PORQUE É QUE O SALDO ESTÁ NAS DUAS TABELAS ════════════════════════════
--
-- `materials.qty` é o saldo e `stock_moves` é o histórico que o explica. O
-- saldo é escrito na MESMA transação do movimento, por isso não há como um
-- existir sem o outro. A alternativa — somar os movimentos a cada listagem —
-- é uma consulta por linha da tabela, e com trezentos materiais a tela
-- demora segundos a abrir.
--
-- ═══ TODO O DDL É GUARDADO ═════════════════════════════════════════════════
--
-- `IF NOT EXISTS` e os blocos `DO $$` que consultam o catálogo: esta migração
-- pode correr duas vezes sem estragar nada. É a convenção do projeto e já
-- salvou um deploy em que o Render reiniciou a meio.

-- ═══ O enum ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockMoveKind') THEN
    CREATE TYPE "StockMoveKind" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE');
  END IF;
END $$;

-- ═══ materials ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "materials" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "sku"        TEXT,
  "unit"       TEXT NOT NULL DEFAULT 'un',
  "category"   TEXT,
  "min_qty"    DECIMAL(12,3),
  "qty"        DECIMAL(12,3) NOT NULL DEFAULT 0,
  -- Quatro casas e não duas: o custo médio de um parafuso comprado a 0,0315 €
  -- arredondado ao cêntimo passa a zero, e aí o consumo dele deixa de custar
  -- nada. O dinheiro dos movimentos continua a duas casas.
  "avg_cost"   DECIMAL(12,4) NOT NULL DEFAULT 0,
  "notes"      TEXT,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- O nome é único: duas linhas "Óleo 5W30" são duas contagens do mesmo óleo, e
-- é assim que um stock deixa de bater com a prateleira.
CREATE UNIQUE INDEX IF NOT EXISTS "materials_name_key" ON "materials" ("name");
CREATE INDEX IF NOT EXISTS "materials_active_idx"   ON "materials" ("active");
CREATE INDEX IF NOT EXISTS "materials_category_idx" ON "materials" ("category");

-- ═══ stock_moves ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS "stock_moves" (
  "id"          TEXT NOT NULL,
  "material_id" TEXT NOT NULL,
  "kind"        "StockMoveKind" NOT NULL,
  "qty"         DECIMAL(12,3) NOT NULL,
  "unit_cost"   DECIMAL(12,4),
  "total_cost"  DECIMAL(12,2),
  "supplier"    TEXT,
  "invoice_ref" TEXT,
  "vehicle_id"  TEXT,
  "booking_id"  TEXT,
  "driver_id"   TEXT,
  "notes"       TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stock_moves_material_id_occurred_at_idx"
  ON "stock_moves" ("material_id", "occurred_at");
-- A pergunta do custo por carro: o que foi gasto neste, e quando.
CREATE INDEX IF NOT EXISTS "stock_moves_vehicle_id_occurred_at_idx"
  ON "stock_moves" ("vehicle_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "stock_moves_booking_id_idx"
  ON "stock_moves" ("booking_id");
CREATE INDEX IF NOT EXISTS "stock_moves_occurred_at_idx"
  ON "stock_moves" ("occurred_at");

-- ═══ As chaves estrangeiras ════════════════════════════════════════════════
--
-- O material é RESTRICT: apagar um material que tem consumos escritos deixaria
-- um histórico de custos sem dizer de que material eram. Desliga-se (`active`)
-- em vez de se apagar.
--
-- O carro, a marcação e o motorista são SET NULL: o movimento aconteceu e o
-- custo foi real mesmo depois de o carro ser vendido. Perder a ligação é
-- aceitável; perder o movimento não.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_moves_material_id_fkey') THEN
    ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_material_id_fkey"
      FOREIGN KEY ("material_id") REFERENCES "materials"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_moves_vehicle_id_fkey') THEN
    ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_moves_booking_id_fkey') THEN
    ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_booking_id_fkey"
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_moves_driver_id_fkey') THEN
    ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_driver_id_fkey"
      FOREIGN KEY ("driver_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_moves_created_by_id_fkey') THEN
    ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ═══ Umas categorias e unidades para começar ═══════════════════════════════
--
-- Não há nada a semear aqui: o material de uma frota é o material DAQUELA
-- frota, e uma lista inventada por mim seria uma lista para apagar. As
-- categorias e as unidades são texto livre, escritas à medida que aparecem.
