// src/modules/investors/investors.math.ts
//
// As contas do portal do investidor, sem base de dados.
//
// Reaproveita o que já existe nos investimentos dos motoristas — dias, taxas,
// arredondamentos, juro diário — porque a regra do dinheiro tem de ser a
// mesma. Duas fórmulas de juro na mesma empresa é a garantia de que um dia os
// dois números não batem certo e ninguém sabe qual está errado.
//
// ─── O QUE É DIFERENTE AQUI ─────────────────────────────────────────────────
//
// Na aplicação de um motorista o valor aplicado é fixo: aplica 500 € e são 500
// € até ao resgate. Numa conta de investidor o capital MEXE — deposita 5 000 €
// em janeiro, mais 3 000 € em março, levanta 1 000 € em maio. O juro de cada
// dia tem de contar sobre o capital que existia NESSE dia.
//
// É isso que este ficheiro faz e o outro não precisava de fazer.
//
// ─── AS REGRAS ──────────────────────────────────────────────────────────────
//
// • JUROS SIMPLES, sobre o CAPITAL. O rendimento acumulado não rende. Quem
//   quiser que renda transfere-o para capital — mas isso é uma decisão tomada
//   por alguém, com um movimento no extrato, e não algo que acontece sozinho.
//
// • UM DEPÓSITO RENDE A PARTIR DO PRÓPRIO DIA. Quem transfere hoje tem hoje
//   como primeiro dia de juro. É a regra mais simples de explicar ao telefone,
//   e é a mais favorável ao investidor — nas dúvidas de arredondamento, o
//   benefício fica do lado de quem confiou o dinheiro.
//
// • 365 DIAS SEMPRE, mesmo em anos bissextos. A taxa anunciada é exatamente a
//   que se recebe num ano de 365 dias.
//
// • SEIS CASAS por dia, arredondamento ao cêntimo só à saída.

import {
  addDays,
  dailyGain,
  rateOn,
  round2,
  round6,
  type Day,
  type RatePoint,
} from '../investments/investments.math';

// Reexportados para o serviço e os testes não terem de importar de dois
// sítios — o módulo do investidor é a porta de entrada destas contas.
export {
  addDays, dateToDay, dayToDate, lisbonDay, round2, round6,
} from '../investments/investments.math';
export type { Day, RatePoint } from '../investments/investments.math';

/** Um movimento de capital, para reconstruir o capital de cada dia. */
export interface CapitalMove {
  day: Day;
  /** Com sinal: depósito positivo, resgate negativo. */
  amount: number;
}

export interface InvestorAccrualDay {
  day: Day;
  /** O capital sobre o qual este dia rendeu. Guardado para o extrato poder
   *  explicar o valor sem refazer a conta. */
  capital: number;
  annualRate: number;
  amount: number;
}

/**
 * O capital no fim de um dia: a soma de tudo o que entrou e saiu até lá.
 *
 * Nunca negativo. Um capital negativo só pode vir de um erro de registo, e
 * render juro negativo em cima de um erro transforma um engano numa dívida ao
 * investidor — é melhor render zero e deixar o erro à vista.
 */
export function capitalOn(moves: CapitalMove[], day: Day): number {
  let total = 0;
  for (const m of moves) if (m.day <= day) total += m.amount;
  return Math.max(0, round6(total));
}

/**
 * Os dias ainda por pagar a uma conta, até `untilExclusive`.
 *
 * Começa no dia a seguir a `accruedThrough` — ou em `startDate`, se a conta
 * ainda não rendeu nada. Devolve lista vazia quando não há nada a pagar.
 *
 * Dias com capital zero são DEVOLVIDOS na mesma, com valor zero. Parecem
 * inúteis mas não são: é o que faz o `accruedThrough` avançar por cima de um
 * período sem dinheiro na conta, em vez de o job voltar a percorrer esses dias
 * todas as noites até ao fim dos tempos. Quem grava é que decide se vale a
 * pena escrever uma linha de zero no extrato (não vale — ver o serviço).
 */
export function pendingInvestorAccruals(args: {
  startDate: Day;
  accruedThrough: Day | null;
  untilExclusive: Day;
  capitalMoves: CapitalMove[];
  rates: RatePoint[];
}): InvestorAccrualDay[] {
  const first = args.accruedThrough ? addDays(args.accruedThrough, 1) : args.startDate;
  const out: InvestorAccrualDay[] = [];

  // Ordenar uma vez em vez de a cada dia: uma conta com anos de história e
  // dezenas de movimentos passa aqui todas as noites.
  const moves = [...args.capitalMoves].sort((a, b) => a.day.localeCompare(b.day));

  let capital = 0;
  let i = 0;

  // Arranca com o capital já acumulado antes do primeiro dia por pagar.
  while (i < moves.length && moves[i].day < first) {
    capital += moves[i].amount;
    i += 1;
  }

  for (let d = first; d < args.untilExclusive; d = addDays(d, 1)) {
    while (i < moves.length && moves[i].day <= d) {
      capital += moves[i].amount;
      i += 1;
    }
    const base = Math.max(0, round6(capital));
    const annualRate = rateOn(args.rates, d);
    out.push({ day: d, capital: base, annualRate, amount: dailyGain(base, annualRate) });
  }

  return out;
}

/**
 * A partir de que dia um resgate pode ser pago.
 *
 * O rendimento é sempre imediato. Só o capital cumpre o aviso prévio da conta —
 * e é por isso que o portal mostra a data antes de o investidor confirmar: um
 * pedido que aparece "pendente" sem se saber até quando gera um telefonema.
 */
export function withdrawalAvailableOn(args: {
  today: Day;
  bucket: 'CAPITAL' | 'EARNINGS';
  noticeDays: number;
}): Day {
  if (args.bucket === 'EARNINGS') return args.today;
  return addDays(args.today, Math.max(0, args.noticeDays));
}

/**
 * Valida um pedido de resgate contra o que está disponível.
 *
 * `available` já vem descontado dos pedidos pendentes (a view trata disso).
 * Sem esse desconto, dois pedidos seguidos do saldo todo passavam os dois.
 */
export function checkWithdrawal(args: {
  amount: number;
  available: number;
}): { ok: true } | { ok: false; reason: 'NOT_POSITIVE' | 'INSUFFICIENT' } {
  const amount = round2(args.amount);
  if (!(amount > 0)) return { ok: false, reason: 'NOT_POSITIVE' };
  // Compara em cêntimos: 0.1 + 0.2 > 0.3 é verdade em vírgula flutuante, e um
  // pedido do saldo exato seria recusado por um milésimo que não existe.
  if (Math.round(amount * 100) > Math.round(round2(args.available) * 100)) {
    return { ok: false, reason: 'INSUFFICIENT' };
  }
  return { ok: true };
}

/**
 * A projeção que o portal mostra: quanto rende este capital em N dias.
 *
 * Informativa, não é promessa — a taxa dos planos flexíveis pode mudar. O
 * ecrã diz isso ao lado do número.
 */
export function projectEarnings(capital: number, annualRate: number, days: number): number {
  return round2(dailyGain(capital, annualRate) * Math.max(0, days));
}
