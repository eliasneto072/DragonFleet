// src/modules/bank/bank.schemas.ts

import { z } from 'zod';

export const bankUserParamSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
});

export const accountParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const submitBankSchema = z.object({
  body: z.object({
    // Formato genérico: dois caracteres de país, dois dígitos de controlo, e o
    // resto alfanumérico. A verificação real é o resto 97, no service — um
    // IBAN pode ter o formato certo e os dígitos trocados.
    iban: z.string().min(15).max(42),
    holderName: z.string().min(3).max(120),
    label: z.string().trim().min(2).max(40).optional(),
    /** Substituir o IBAN desta conta em vez de criar outra. */
    accountId: z.string().min(1).optional(),
  }),
});

export const reviewBankSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    approve: z.coerce.boolean(),
    /** Obrigatório ao recusar — validado no service. */
    reason: z.string().max(2000).optional(),
  }),
});

export const renameBankSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ label: z.string().trim().min(2).max(40) }),
});
