// src/modules/settlements/settlements.schemas.ts

import { z } from 'zod';
import { SettlementStatus } from '../../shared/types/enums';

/** "YYYY-MM-DD" */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

/**
 * Valores monetários. coerce porque formulários enviam strings com frequência,
 * e recusar "119.43" por vir entre aspas seria rigor sem utilidade.
 */
const money = z.coerce.number().min(0, 'Valor não pode ser negativo').default(0);

const amountsShape = {
  uberAmount: money.optional(),
  boltAmount: money.optional(),
  otherRevenue: money.optional(),

  tollsAmount: money.optional(),
  fuelAmount: money.optional(),
  vehicleFee: money.optional(),
  otherDeductions: money.optional(),

  /** Pontos percentuais (15 = 15%). Omitido, usa o valor das configurações. */
  commissionRate: z.coerce.number().min(0).max(100).optional(),
  /**
   * Imposto, em pontos percentuais. Omitido, usa o valor das configurações.
   *
   * Aceite no schema mas o formulário não o envia: o campo é calculado e de
   * leitura. Existe para a pré-visualização poder simular outra taxa sem que
   * ninguém tenha de alterar as configurações para experimentar. Sem isto, o
   * zod recusava o campo e a simulação era impossível.
   */
  taxRate: z.coerce.number().min(0).max(100).optional(),
  /** Visível ao motorista, no detalhe da semana. */
  notes: z.string().max(2000).optional().nullable(),
  /** Só a gestão vê. Filtrado na origem, no repositório. */
  internalNotes: z.string().max(2000).optional().nullable(),
};

export const settlementIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

/**
 * Os filtros que a LISTA e a EXPORTAÇÃO partilham.
 *
 * Estão aqui, num sítio só, pela mesma razão que o `buildSettlementWhere` está
 * no repositório: se a exportação tiver a sua própria definição de filtros, um
 * dia a tela mostra um total e o ficheiro que vai para o contabilista mostra
 * outro, e ninguém consegue dizer qual está certo.
 *
 * A paginação NÃO entra aqui — é da lista e não faz sentido num ficheiro, que
 * leva sempre a seleção inteira.
 */
export const settlementFiltersShape = {
  userId: z.string().min(1).optional(),
  status: z.nativeEnum(SettlementStatus).optional(),
  from: dayString.optional(),
  to: dayString.optional(),
  search: z.string().max(120).optional(),
} as const;

export const listSettlementsSchema = z.object({
  query: z.object({
    ...settlementFiltersShape,
    // Chegam como texto na query string. O parsePage trata dos valores
    // absurdos e aplica o teto; aqui basta deixá-los passar.
    page: z.string().optional(),
    pageSize: z.string().optional(),
  }),
});

/** GET /reports/settlements.xlsx — os mesmos filtros, sem paginação. */
export const exportSettlementsSchema = z.object({
  query: z.object(settlementFiltersShape),
});

export const createSettlementSchema = z.object({
  body: z.object({
    userId: z.string().min(1, 'Selecione o motorista'),
    vehicleId: z.string().min(1).optional().nullable(),
    weekStart: dayString,
    weekEnd: dayString,
    ...amountsShape,
  }),
});

export const updateSettlementSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    vehicleId: z.string().min(1).optional().nullable(),
    weekStart: dayString,
    weekEnd: dayString,
    ...amountsShape,
  }),
});

/** Pré-visualização: não grava, por isso não exige motorista nem semana. */
export const previewSettlementSchema = z.object({
  body: z.object(amountsShape),
});

export const cancelSettlementSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    reason: z.string().max(2000).optional(),
  }),
});
