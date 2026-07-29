import { z } from 'zod';
import { EarningPlatform, EarningStatus } from '../../shared/types/enums';

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

export const listEarningsSchema = z.object({
  query: z.object({
    userId: z.string().min(1).optional(),
    status: z.nativeEnum(EarningStatus).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export const createEarningSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
    date: z.coerce.date(),
    platform: z.nativeEnum(EarningPlatform),
    notes: z.string().max(2000).optional().nullable(),
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
      notes: z.string().max(2000).optional().nullable(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
});

// O estado é restringido aos dois resultados possíveis de uma revisão:
// devolver algo a PENDING não é decisão, é desfazer, e tem outro caminho.
export const reviewEarningSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.enum([EarningStatus.APPROVED, EarningStatus.REJECTED]),
    notes: z.string().max(2000).optional().nullable(),
  }),
});

export const reportedRangeSchema = z.object({
  query: z.object({
    userId: z.string().min(1),
    from: z.coerce.date(),
    to: z.coerce.date(),
  }),
});
