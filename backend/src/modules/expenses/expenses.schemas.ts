// src/modules/expenses/expenses.schemas.ts
//
// As linhas chegam como TEXTO CRU das células do portal — ver a nota no topo do
// expenses.service sobre porque é o servidor que as lê. Aqui só se limita o
// tamanho: o conteúdo é validado ao ler, linha a linha, e o que não se lê é
// devolvido com o motivo em vez de rebentar o pedido inteiro.
import { z } from 'zod';

const celula = z.string().max(500).nullable().optional();

const rawRow = z.object({
  date: celula, card: celula, plate: celula, identifier: celula,
  description: celula, service: celula, amount: celula, status: celula,
  receipt: celula, station: celula, fuel: celula,
});

export const ingestExpensesSchema = z.object({
  body: z.object({
    source: z.enum(['PRIO', 'VIA_VERDE']),
    rows: z.array(rawRow).min(1).max(2000),
  }),
});

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const forSettlementSchema = z.object({
  query: z.object({
    userId: z.string().min(1),
    weekStart: z.string().regex(DIA, 'Deve ser AAAA-MM-DD'),
  }),
});

export const updateMovementSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    userId: z.string().min(1).nullable().optional(),
    chargeable: z.boolean().optional(),
  }).refine((b) => b.userId !== undefined || b.chargeable !== undefined, {
    message: 'Indique o motorista ou se se desconta.',
  }),
});

export const listCardsSchema = z.object({
  query: z.object({
    userId: z.string().min(1).optional(),
    vehicleId: z.string().min(1).optional(),
  }),
});

export const saveCardSchema = z.object({
  params: z.object({ id: z.string().min(1).optional() }),
  body: z.object({
    number: z.string().min(1).max(40),
    label: z.string().max(80).nullable().optional(),
    userId: z.string().min(1).nullable().optional(),
    vehicleId: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
  }),
});

export const cardIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
