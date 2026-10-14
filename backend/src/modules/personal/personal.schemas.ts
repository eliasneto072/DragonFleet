// src/modules/personal/personal.schemas.ts
//
// A validação do que entra nas finanças pessoais.
//
// ─── PORQUE É QUE AS DATAS SÃO TEXTO E NÃO `z.coerce.date()` ────────────────
//
// Porque "2026-10-14" dado ao `Date` do JavaScript nasce à MEIA-NOITE UTC, e
// um fuso a oeste empurra-o para o dia anterior. Uma despesa do dia 1 passa a
// contar no mês anterior, e o total de Outubro fica errado por causa de uma
// hora — o género de engano que só se descobre em Janeiro, a comparar meses.
//
// Aqui exige-se o formato e ancora-se ao MEIO-DIA UTC, que fica no mesmo dia
// em qualquer fuso do planeta.
//
// ─── E PORQUE É QUE OS NÚMEROS ACEITAM VÍRGULA ──────────────────────────────
//
// Porque são preenchidos em português. "12,50" é o que sai de um teclado
// português sem ninguém pensar duas vezes, e `Number("12,50")` é `NaN` — que,
// gravado, dava uma despesa de zero euros com ar de estar feita.

import { z } from 'zod';

/** "2026-10-14" → a Date desse dia, ao meio-dia UTC. */
const dataDoDia = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).')
  .transform((t) => new Date(`${t}T12:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Data inválida.');

const dataOpcional = dataDoDia.nullish();

/** Um número que pode vir com vírgula decimal. */
const numero = z.union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.'))))
  .refine((n) => Number.isFinite(n), 'Não é um número.');

const numeroOpcional = z.union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  })
  .nullish();

const idParam = z.object({ params: z.object({ id: z.string().min(1) }) });

export const operacaoIdSchema = idParam;
export const categoriaIdSchema = idParam;
export const despesaIdSchema = idParam;

const corpoDaOperacao = z.object({
  asset: z.string().trim().min(1, 'Diga o que negociou.').max(60),
  broker: z.string().trim().max(60).nullish(),
  direction: z.enum(['LONG', 'SHORT']),
  openedAt: dataDoDia,
  /** Nulo enquanto a posição está aberta. */
  closedAt: dataOpcional,
  size: numeroOpcional,
  entryPrice: numeroOpcional,
  exitPrice: numeroOpcional,
  /**
   * O resultado BRUTO, antes de comissões. Pode ser negativo — uma operação
   * que correu mal é metade do que um diário destes serve para mostrar.
   */
  result: numero,
  fees: numeroOpcional,
  notes: z.string().trim().max(1000).nullish(),
})
  // Fechar antes de abrir é sempre um engano de dedo, e passaria despercebido
  // no meio de uma lista ordenada pela data de abertura.
  .refine((o) => !o.closedAt || o.closedAt >= o.openedAt, {
    message: 'A data de fecho não pode ser anterior à de abertura.',
    path: ['closedAt'],
  });

export const criarOperacaoSchema = z.object({ body: corpoDaOperacao });
export const actualizarOperacaoSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: corpoDaOperacao,
});

const corpoDaDespesa = z.object({
  categoryId: z.string().min(1).nullish(),
  /**
   * Maior que zero. O sinal está no nome — é uma despesa — e um valor
   * negativo aqui seria uma receita disfarçada a somar ao saldo.
   */
  amount: numero.refine((n) => Math.abs(n) > 0, 'O valor não pode ser zero.'),
  spentOn: dataDoDia,
  notes: z.string().trim().max(500).nullish(),
  /**
   * O comprovativo é opcional e pode chegar depois.
   *
   * Ausente e nulo querem dizer coisas diferentes numa alteração: ausente é
   * «não mexer no que lá está», nulo é «tirar». Daí `.optional()` e não um
   * valor por omissão.
   */
  receiptUrl: z.string().trim().max(1000).nullish().optional(),
  receiptKey: z.string().trim().max(500).nullish().optional(),
});

export const criarDespesaSchema = z.object({ body: corpoDaDespesa });
export const actualizarDespesaSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: corpoDaDespesa,
});

export const criarCategoriaSchema = z.object({
  body: z.object({ nome: z.string().trim().min(1, 'Dê um nome à categoria.').max(40) }),
});
