// src/modules/ranks/ranks.schemas.ts

import { z } from 'zod';

const tier = z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4', 'TIER_5']);
const pct = z.coerce.number().min(0).max(100);

export const tierParamSchema = z.object({
  params: z.object({ tier }),
});

export const userIdParamSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
});

export const updateConfigSchema = z.object({
  params: z.object({ tier }),
  body: z.object({
    label: z.string().trim().min(2, 'Dê um nome ao nível.').max(40).optional(),
    // Cor em hexadecimal: é o que o cartão e o emblema usam.
    color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB.').optional(),
    minSeasonRevenue: z.coerce.number().min(0).optional(),
    minInvested: z.coerce.number().min(0).optional(),
    minBalance: z.coerce.number().min(0).optional(),
    minWeeks: z.coerce.number().int().min(0).max(60).optional(),
    requireValidDocuments: z.boolean().optional(),
    fuelDiscount: pct.optional(),
    vehicleDiscount: pct.optional(),
    tollsDiscount: pct.optional(),
    investmentRateBonus: z.coerce.number().min(0).max(50).optional(),
    perks: z.string().trim().max(1000).optional().nullable(),
  }),
});

export const overviewQuerySchema = z.object({
  query: z.object({
    tier: tier.optional(),
    search: z.string().max(100).optional(),
  }),
});
