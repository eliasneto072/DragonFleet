// src/modules/investors/investors.schemas.ts

import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const bucket = z.enum(['CAPITAL', 'EARNINGS']);
const money = z.coerce.number().finite();
const positiveMoney = money.refine((n) => n > 0, 'O valor tem de ser maior do que zero.');

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// ── Investidor ──────────────────────────────────────────────────────────────

export const statementQuerySchema = z.object({
  query: z.object({
    accountId: z.string().min(1).optional(),
    from: day.optional(),
    to: day.optional(),
    kind: z.enum(['DEPOSIT', 'ACCRUAL', 'WITHDRAWAL', 'ADJUSTMENT']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const accountQuerySchema = z.object({
  query: z.object({ accountId: z.string().min(1).optional() }),
});

export const requestWithdrawalSchema = z.object({
  body: z.object({
    bucket,
    amount: positiveMoney,
    note: z.string().trim().max(500).optional(),
  }),
});

// ── Administração ───────────────────────────────────────────────────────────

export const createInvestorSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Escreva o nome do investidor.').max(120),
    email: z.string().trim().email('Email inválido.'),
    // Oito caracteres é o mínimo do resto do projeto. A palavra-passe é
    // definida aqui e comunicada por quem cria a conta; o investidor troca-a
    // depois no perfil.
    password: z.string().min(8, 'A palavra-passe precisa de pelo menos 8 caracteres.').max(100),
    phone: z.string().trim().max(30).optional(),
    annualRate: z.coerce.number().min(0).max(100),
    noticeDays: z.coerce.number().int().min(0).max(365).optional(),
    startDate: day.optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const updateAccountSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    noticeDays: z.coerce.number().int().min(0).max(365).optional(),
    status: z.enum(['ACTIVE', 'CLOSED']).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const depositSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: positiveMoney,
    day: day.optional(),
    description: z.string().trim().max(200).optional(),
  }),
});

export const adjustSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    bucket,
    // Pode ser negativo: um acerto tanto corrige para cima como para baixo.
    amount: money.refine((n) => n !== 0, 'O valor não pode ser zero.'),
    description: z.string().trim().min(3, 'Escreva o motivo do acerto.').max(200),
  }),
});

export const setRateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    annualRate: z.coerce.number().min(0).max(100),
    effectiveFrom: day.optional(),
  }),
});

export const decideWithdrawalSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    approve: z.boolean(),
    decision: z.string().trim().max(500).optional(),
  }),
});

export const listAccountsQuerySchema = z.object({
  query: z.object({
    search: z.string().max(100).optional(),
    status: z.enum(['ACTIVE', 'CLOSED']).optional(),
    /** total | capital | earnings | oldest | name */
    sort: z.enum(['total', 'capital', 'earnings', 'oldest', 'name']).optional(),
  }),
});
