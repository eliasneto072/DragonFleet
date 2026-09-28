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
    /**
     * Para qual das contas bancárias. Opcional: sem ela usa-se a principal,
     * que é o que acontece a quem só tem uma — e a quem pediu antes de este
     * campo existir.
     */
    bankAccountId: z.string().min(1).optional(),
  }),
});

export const updateWithdrawalStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.nativeEnum(WithdrawalStatus),
    notes: z.string().min(1).optional(),
    /** Sociedade a quem o recibo verde foi emitido. Ver withdrawals.service. */
    companyId: z.string().min(1).optional().nullable(),
    companyOther: z.string().min(1).max(200).optional().nullable(),
  }),
});

/** Corrigir a sociedade do recibo. Ambos ausentes = "Nenhum". */
export const setWithdrawalCompanySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    companyId: z.string().min(1).optional().nullable(),
    companyOther: z.string().min(1).max(200).optional().nullable(),
  }),
});
