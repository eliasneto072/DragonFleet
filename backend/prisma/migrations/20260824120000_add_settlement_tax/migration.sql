-- Imposto sobre a faturação no fecho semanal.
--
-- Aditiva: só acrescenta colunas, nada é reescrito nem apagado. Os fechos já
-- registados continuam exatamente como foram pagos.
--
-- NULL e não 0 nas colunas do fecho, de propósito. Um fecho anterior a esta
-- migração não teve imposto nenhum aplicado; um fecho futuro pode legitimamente
-- ter imposto zero, se a taxa for posta a 0 nas configurações. Se ambos
-- ficassem a 0, as telas não conseguiriam distinguir os dois casos e mostrariam
-- uma linha de "Imposto 0,00 €" em semanas onde o campo nem existia.
--
-- A taxa nas configurações tem DEFAULT 6, que é o valor que o cliente indicou.
-- Fica em system_settings e não cravada no código porque o Estado altera taxas;
-- quando isso acontecer, muda-se ali e os fechos passados mantêm a sua própria
-- cópia da taxa que foi aplicada.

ALTER TABLE "weekly_settlements" ADD COLUMN "tax_base"   DECIMAL(12,2);
ALTER TABLE "weekly_settlements" ADD COLUMN "tax_rate"   DECIMAL(5,2);
ALTER TABLE "weekly_settlements" ADD COLUMN "tax_amount" DECIMAL(12,2);

ALTER TABLE "system_settings"
  ADD COLUMN "settlement_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 6;
