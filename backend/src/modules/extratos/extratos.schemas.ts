// src/modules/extratos/extratos.schemas.ts

import { z } from 'zod';

const ambito = z.enum(['PESSOAL', 'EMPRESA']);
const classe = z.enum(['DESPESA', 'RECEITA', 'TRANSFERENCIA']);

export const ambitoQuerySchema = z.object({ query: z.object({ ambito }) });

export const preverSchema = z.object({ body: z.object({ ambito }) });

/** Um movimento tal como saiu da previsão, mais a escolha dele. */
const movimento = z.object({
  pos: z.number().int().min(0),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dataLancamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  descricao: z.string().max(500),
  valor: z.number(),
  saldo: z.number().nullish(),
  referencia: z.string().max(80).nullish(),
  classe,
  motivo: z.string().max(300).optional(),
  confianca: z.string().max(20).optional(),
  conta: z.boolean(),
  escolha: z.object({
    pos: z.number().int().min(0),
    classe,
    conta: z.boolean(),
    categoriaId: z.string().nullish(),
  }).optional(),
});

export const importarSchema = z.object({
  body: z.object({
    ambito,
    contaId: z.string().nullish(),
    novaConta: z.object({
      banco: z.enum(['ABANCA', 'NOVO_BANCO', 'MILLENNIUM', 'REVOLUT', 'REVOLUT_BUSINESS']),
      tail: z.string().min(1).max(8),
      label: z.string().min(1).max(60),
    }).nullish(),
    ficheiro: z.object({
      nome: z.string().min(1).max(200),
      hash: z.string().regex(/^[0-9a-f]{64}$/, 'Impressão digital do ficheiro inválida.'),
    }),
    periodo: z.object({
      de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    }),
    saldoInicial: z.number().nullish(),
    saldoFinal: z.number().nullish(),
    // Um extrato com mais de mil linhas não é um extrato mensal: é um engano,
    // e aceitar o pedido só o tornava lento antes de falhar.
    movimentos: z.array(movimento).min(1).max(1000),
  }),
});

export const extratoIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({ ambito }),
});
