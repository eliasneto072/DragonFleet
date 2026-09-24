// src/modules/projects/projects.schemas.ts

import { z } from 'zod';

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Mês no formato AAAA-MM.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const money = z.coerce.number().finite().min(0);

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listQuerySchema = z.object({
  query: z.object({
    status: z.enum(['DRAFT', 'FUNDING', 'ACTIVE', 'CLOSED', 'CANCELLED']).optional(),
    search: z.string().max(100).optional(),
  }),
});

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3, 'Dê um nome ao projeto.').max(120),
    description: z.string().trim().max(2000).optional(),
    targetAmount: money.refine((n) => n > 0, 'A meta tem de ser maior do que zero.'),
    minTicket: money.optional(),
    profitShare: z.coerce.number().min(0).max(100).optional(),
    vehicleId: z.string().min(1).nullable().optional(),
    riskLevel: z.string().trim().max(10).optional(),
    fundingClosesOn: day.optional(),
    endsOn: day.optional(),
    includeCommission: z.boolean().optional(),
    includeVehicleFee: z.boolean().optional(),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    targetAmount: money.optional(),
    minTicket: money.optional(),
    profitShare: z.coerce.number().min(0).max(100).optional(),
    vehicleId: z.string().min(1).nullable().optional(),
    riskLevel: z.string().trim().max(10).nullable().optional(),
    fundingClosesOn: day.nullable().optional(),
    endsOn: day.nullable().optional(),
    includeCommission: z.boolean().optional(),
    includeVehicleFee: z.boolean().optional(),
    imageUrl: z.string().url().nullable().optional(),
  }),
});

export const activateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ startedOn: month.optional() }),
});

export const cancelSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ reason: z.string().trim().max(500).optional() }),
});

export const monthParamSchema = z.object({
  params: z.object({ id: z.string().min(1), month }),
});

export const closeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    /**
     * Quanto rendeu a venda. Nulo é uma escolha e não uma omissão: significa
     * "fechou sem venda", e aí devolve-se o capital tal como entrou.
     */
    saleAmount: money.nullable().optional(),
    notes: z.string().trim().max(500).optional(),
  }),
});

export const expenseSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    month,
    amount: money.refine((n) => n > 0, 'O valor tem de ser maior do que zero.'),
    description: z.string().trim().min(3, 'Escreva o que foi esta despesa.').max(200),
  }),
});

export const subscribeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: z.coerce.number().finite().positive(),
  }),
});
