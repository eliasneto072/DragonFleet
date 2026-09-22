// src/modules/investments/investments.schemas.ts

import { z } from 'zod';
import { InvestmentPlanType } from '../../shared/types/enums';

const rate = z.coerce.number()
  .min(0, 'A taxa não pode ser negativa.')
  .max(100, 'A taxa anual não pode passar de 100%.');

const tier = z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5']);

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const userIdParamSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
});

export const createPlanSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Dê um nome ao plano.').max(80),
    description: z.string().trim().max(500).optional().nullable(),
    type: z.nativeEnum(InvestmentPlanType),
    annualRate: rate,
    termDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
    earlyWithdrawalPenalty: z.coerce.number().min(0).max(100).optional().nullable(),
    minAmount: z.coerce.number().min(0).optional(),
    minRank: tier.optional().nullable(),
    active: z.boolean().optional(),
  }),
});

export const updatePlanSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    annualRate: rate.optional(),
    termDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
    earlyWithdrawalPenalty: z.coerce.number().min(0).max(100).optional().nullable(),
    minAmount: z.coerce.number().min(0).optional(),
    minRank: tier.optional().nullable(),
    active: z.boolean().optional(),
  }),
});

export const setRateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    annualRate: rate,
    effectiveFrom: dia.optional(),
  }),
});

export const subscribeSchema = z.object({
  body: z.object({
    planId: z.string().min(1),
    amount: z.coerce.number().positive('O valor tem de ser maior que zero.'),
  }),
});

export const overviewQuerySchema = z.object({
  query: z.object({
    status: z.enum(['ACTIVE', 'CLOSED']).optional(),
    planId: z.string().min(1).optional(),
    search: z.string().max(100).optional(),
  }),
});
