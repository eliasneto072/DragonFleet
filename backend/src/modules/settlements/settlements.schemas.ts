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
  notes: z.string().max(2000).optional().nullable(),
};

export const settlementIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSettlementsSchema = z.object({
  query: z.object({
    userId: z.string().min(1).optional(),
    status: z.nativeEnum(SettlementStatus).optional(),
    from: dayString.optional(),
    to: dayString.optional(),
  }),
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
