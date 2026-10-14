// src/modules/company/company.schemas.ts
//
// A validação do que entra nas contas da empresa.
//
// As mesmas regras das finanças pessoais, e pelas mesmas razões: as datas
// ancoradas ao MEIO-DIA UTC (à meia-noite, um fuso a oeste empurra o dia 1
// para o mês anterior e o total do mês fica errado), e os números a aceitar
// vírgula decimal, porque são escritos num teclado português.

import { z } from 'zod';

const dataDoDia = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).')
  .transform((t) => new Date(`${t}T12:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Data inválida.');

const numero = z.union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.'))))
  .refine((n) => Number.isFinite(n), 'Não é um número.');

export const periodoSchema = z.object({
  query: z.object({
    de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

export function periodoDaQuery(query: unknown): { de: Date | null; ate: Date | null } {
  const { query: q } = periodoSchema.parse({ query: query ?? {} });
  return {
    de: q.de ? new Date(`${q.de}T00:00:00.000Z`) : null,
    // Fim do dia: um `lte` ao meio-dia cortava fora tudo o que tivesse hora
    // depois disso, e as despesas do último dia desapareciam da conta.
    ate: q.ate ? new Date(`${q.ate}T23:59:59.999Z`) : null,
  };
}

const corpoDaDespesa = z.object({
  categoryId: z.string().min(1).nullish(),
  amount: numero.refine((n) => Math.abs(n) > 0, 'O valor não pode ser zero.'),
  spentOn: dataDoDia,
  supplier: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(500).nullish(),
  receiptUrl: z.string().trim().max(1000).nullish().optional(),
  receiptKey: z.string().trim().max(500).nullish().optional(),
});

export const criarDespesaSchema = z.object({ body: corpoDaDespesa });
export const actualizarDespesaSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: corpoDaDespesa,
});
export const despesaIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });
export const categoriaIdSchema = despesaIdSchema;

export const criarCategoriaSchema = z.object({
  body: z.object({ nome: z.string().trim().min(1, 'Dê um nome à categoria.').max(60) }),
});

/**
 * Declarar o saldo do banco.
 *
 * O saldo PODE ser negativo: uma conta a descoberto é um estado real, e
 * recusá-lo escondia precisamente a situação que isto existe para mostrar.
 */
export const declararSaldoSchema = z.object({
  body: z.object({
    saldo: numero,
    quando: dataDoDia,
    nota: z.string().trim().max(500).nullish(),
  }),
});
