import { z } from 'zod';
import { WithdrawalStatus } from '../../shared/types/enums';

export const withdrawalIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
});

export const createWithdrawalSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
  }),
});

export const updateWithdrawalStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.nativeEnum(WithdrawalStatus),
    notes: z.string().min(1).optional(),
  }),
});