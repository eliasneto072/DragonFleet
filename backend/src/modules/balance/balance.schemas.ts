import { z } from 'zod';
import { AdjustmentType } from '../../shared/types/enums';

export const balanceUserParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
});

export const createAdjustmentSchema = z.object({
  params: z.object({
    userId: z.string().min(1),
  }),
  body: z.object({
    type: z.nativeEnum(AdjustmentType),
    amount: z.coerce.number().positive('O valor deve ser maior que zero.'),
    reason: z.string().trim().min(3, 'Descreva o motivo do ajuste.').max(500),
  }),
});