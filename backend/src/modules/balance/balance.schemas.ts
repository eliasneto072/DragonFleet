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
    // Motivo opcional. Se vier, no máximo 500 caracteres.
    reason: z.string().trim().max(500).optional(),
  }),
});

/**
 * PATCH /balance/adjustments/:adjustmentId
 *
 * Só a data e o motivo. O valor e o tipo não estão aqui de propósito: mudá-los
 * mudaria o saldo sem deixar rasto, e a forma certa de corrigir um valor
 * errado é um ajuste contrário. Ver `updateAdjustment` no serviço.
 *
 * O `.refine` exige pelo menos um dos dois — um PATCH vazio devolveria 200 sem
 * ter feito nada, e quem chamou ficava a pensar que tinha gravado.
 */
export const updateAdjustmentSchema = z.object({
  params: z.object({
    adjustmentId: z.string().min(1),
  }),
  body: z.object({
    createdAt: z.coerce.date().optional(),
    reason: z.string().trim().max(500).optional(),
  }).refine(
    (b) => b.createdAt !== undefined || b.reason !== undefined,
    { message: 'Indique a data ou o motivo a alterar.' },
  ),
});