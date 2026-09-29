-- Tipo de energia da viatura, e os quilómetros no fecho semanal.
--
-- ─── PORQUE É QUE O TIPO DE ENERGIA É UM ENUM E NÃO UM BOOLEAN ──────────────
--
-- Um `is_electric` obrigava a decidir hoje o que fazer com um híbrido, e a
-- resposta seria arbitrária: marcá-lo como elétrico esconde o gasto em
-- combustível, marcá-lo como combustível esconde o carregamento. Com três
-- valores, o híbrido é o que é, e o ecrã pode mostrar-lhe os dois campos.
--
-- O valor por omissão é FUEL porque é o que a frota tem hoje. Uma coluna
-- obrigatória sem omissão rebentaria a migração numa tabela com linhas.
--
-- ─── PORQUE É QUE NÃO HÁ UMA COLUNA NOVA PARA O CARREGAMENTO ────────────────
--
-- Deliberado. `fuel_amount` passa a querer dizer "o que se gastou a mover o
-- carro" — gasóleo ou eletricidade. Duas colunas obrigariam todas as somas,
-- exportações e fechos antigos a passar a tratar dois casos, e a conta é
-- exatamente a mesma. O que muda é o RÓTULO no ecrã, conforme o tipo do carro,
-- e isso não precisa de base de dados.
--
-- ─── OS QUILÓMETROS ────────────────────────────────────────────────────────
--
-- Opcionais (NULL), e nulos em tudo o que já existe. É a diferença entre "esta
-- semana não foram registados" e "esta semana andou zero quilómetros" — e um
-- zero a fingir estragava qualquer média.
--
-- INTEGER e não DECIMAL: ninguém lê meio quilómetro num conta-quilómetros.

CREATE TYPE "VehicleEnergy" AS ENUM ('FUEL', 'ELECTRIC', 'HYBRID');

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "energy_type" "VehicleEnergy" NOT NULL DEFAULT 'FUEL';

ALTER TABLE "weekly_settlements"
  ADD COLUMN IF NOT EXISTS "odometer_start" INTEGER,
  ADD COLUMN IF NOT EXISTS "odometer_end"   INTEGER;

-- A guarda que impede o engano mais provável: trocar os dois campos, ou
-- escrever um quilómetro a menos do que a semana anterior. Só se aplica quando
-- os DOIS estão preenchidos — ver a nota sobre os nulos acima.
ALTER TABLE "weekly_settlements"
  DROP CONSTRAINT IF EXISTS "weekly_settlements_odometer_order";

ALTER TABLE "weekly_settlements"
  ADD CONSTRAINT "weekly_settlements_odometer_order"
  CHECK (
    "odometer_start" IS NULL
    OR "odometer_end" IS NULL
    OR "odometer_end" >= "odometer_start"
  );

-- As estatísticas por carro filtram sempre por veículo e por semana.
CREATE INDEX IF NOT EXISTS "weekly_settlements_vehicle_week_idx"
  ON "weekly_settlements" ("vehicle_id", "week_start");
