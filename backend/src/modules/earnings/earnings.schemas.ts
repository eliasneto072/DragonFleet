import { z } from 'zod';
import { EarningPlatform } from '../../shared/types/enums';

export const earningIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
});

export const createEarningSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
    date: z.coerce.date(),
    platform: z.nativeEnum(EarningPlatform),
    userId: z.string().min(1).optional(), // admin pode especificar, driver usa o próprio id
  }),
});

export const updateEarningSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      amount: z.coerce.number().positive().optional(),
      date: z.coerce.date().optional(),
      platform: z.nativeEnum(EarningPlatform).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});