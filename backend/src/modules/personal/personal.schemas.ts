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

/**
 * Uma data que pode não existir.
 *
 * ─── O CAMPO VAZIO É «SEM DATA», NÃO «DATA INVÁLIDA» ───────────────────────
 *
 * Um `<input type="date">` por preencher vale `""`, e é isso que o formulário
 * envia. O `nullish()` sozinho aceita `null` e `undefined` mas NÃO aceita
 * `""` — e a resposta era «Data inválida (use AAAA-MM-DD)».
 *
 * Criar funcionava porque o formulário novo nem enviava o campo. Editar não:
 * ao abrir um crédito por liquidar ou uma operação de trading ainda aberta, o
 * formulário carregava `""` no campo da data de fecho, e gravar era
 * impossível. Qualquer crédito não liquidado e qualquer posição aberta
 * ficavam impossíveis de editar.
 *
 * O `preprocess` trata o vazio como ausência ANTES da validação, que é o que
 * ele quer dizer. Está aqui num sítio só, por isso vale para a data de fecho
 * do trading e para a de liquidação do crédito ao mesmo tempo — e para
 * qualquer campo de data opcional que venha a existir.
 */
const dataOpcional = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  dataDoDia.nullish(),
);

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

const corpoDoCredito = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao crédito.').max(80),
  lender: z.string().trim().max(80).nullish(),
  principal: numero.refine((n) => n > 0, 'O capital tem de ser maior que zero.'),
  startedOn: dataDoDia,
  /**
   * Pelo menos uma. Zero dava uma divisão por zero na percentagem paga — e a
   * base de dados também o recusa, porque uma guarda que depende de alguém se
   * lembrar não é uma guarda.
   */
  installments: z.coerce.number().int().min(1, 'Tem de ter pelo menos uma prestação.').max(600),
  monthlyPayment: numeroOpcional,
  /** Em pontos percentuais: 5.4 é 5,4%. */
  tan: numeroOpcional,
  taeg: numeroOpcional,
  mtic: numeroOpcional,
  notes: z.string().trim().max(1000).nullish(),
  /** Liquidado antes do fim. Nulo é o caso normal. */
  closedOn: dataOpcional,

  /**
   * O que se devolve ao todo. A alternativa à taxa.
   *
   * Num empréstimo de um investidor particular não há TAN: há o que se pediu
   * e o que se devolve. A diferença entre os dois É o juro.
   */
  totalToPay: numeroOpcional,

  /**
   * «A partir da N.ª prestação, passa a ser X.»
   *
   * No máximo 60 tramos: um crédito com mais do que isso não tem tramos, tem
   * um plano de pagamentos linha a linha — e aceitar mil tornava o pedido
   * lento antes de falhar.
   */
  tramos: z.array(z.object({
    dePrestacao: z.coerce.number().int().min(1).max(600),
    valor: numero,
  })).max(60).optional(),
});

export const criarCreditoSchema = z.object({ body: corpoDoCredito });
export const actualizarCreditoSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: corpoDoCredito,
});
export const creditoIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

export const criarCategoriaSchema = z.object({
  body: z.object({ nome: z.string().trim().min(1, 'Dê um nome à categoria.').max(40) }),
});


/**
 * O período, lido da barra de endereço: `?de=2026-10-01&ate=2026-10-31`.
 *
 * Os dois são opcionais e os dois são INCLUSIVOS. O fim é ancorado ao fim do
 * dia, e não ao meio-dia como as outras datas deste ficheiro: um `lte` ao
 * meio-dia cortava fora tudo o que tivesse hora depois disso, e as despesas
 * do último dia do período desapareciam da conta.
 */
/** O mesmo tratamento do vazio: `?de=&ate=` quer dizer «sem filtro». */
const diaDaQuery = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

export const periodoSchema = z.object({
  query: z.object({ de: diaDaQuery, ate: diaDaQuery }),
});

export function periodoDaQuery(query: unknown): { de: Date | null; ate: Date | null } {
  const { query: q } = periodoSchema.parse({ query: query ?? {} });
  return {
    de: q.de ? new Date(`${q.de}T00:00:00.000Z`) : null,
    ate: q.ate ? new Date(`${q.ate}T23:59:59.999Z`) : null,
  };
}


export const pagamentoSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    paidOn: dataDoDia,
    amount: numero,
    notes: z.string().trim().max(300).nullish(),
  }),
});

export const pagamentoIdSchema = z.object({
  params: z.object({ id: z.string().min(1), pagamentoId: z.string().min(1) }),
});
