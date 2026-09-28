// src/modules/investments/investments.math.ts
//
// As contas dos investimentos, sem base de dados.
//
// Separadas do serviço de propósito: é aqui que está o dinheiro, e funções
// puras testam-se com números escritos à mão, sem Postgres nem Prisma. O
// serviço só vai buscar os dados, chama isto e grava o resultado.
//
// ─── AS REGRAS (decididas pelo cliente) ─────────────────────────────────────
//
// • JUROS SIMPLES. Cada dia rende sobre o valor aplicado, nunca sobre os
//   ganhos acumulados: ganho do dia = principal × taxa ÷ 100 ÷ 365.
//   365 sempre, mesmo em anos bissextos — um dia a mais por quatro anos não
//   justifica duas fórmulas, e assim a taxa anunciada é exatamente a que se
//   recebe num ano de 365 dias.
//
// • QUE DIAS RENDEM. Do dia da aplicação (inclusive) até ao dia do resgate
//   (exclusive). Aplicar e resgatar no mesmo dia rende zero; aplicar hoje e
//   resgatar amanhã rende um dia. É a regra de "ganhos até ao dia anterior".
//   Nos planos fixos, o prazo de N dias paga exatamente N dias.
//
// • DATAS EM LISBOA. "Hoje" é o dia civil em Portugal, não em UTC — entre a
//   meia-noite e a uma da manhã (verão) os dois discordam, e um resgate feito
//   a essa hora contaria o dia errado.
//
// • ARREDONDAMENTO. Cada dia guarda-se com 6 casas; só o total que volta ao
//   saldo é arredondado ao cêntimo, uma vez, no fim. Arredondar cada dia
//   perderia até meio cêntimo por dia.
//
// • PENALIZAÇÃO (fixos, resgate antecipado). Percentagem do VALOR APLICADO,
//   não dos ganhos. Assim o motorista sabe o custo antes de aplicar, e esse
//   custo não depende de quantos dias já passaram. Pode fazer o resgate valer
//   menos do que o aplicado — o ecrã mostra o valor exato antes de confirmar.

/** Dia civil no formato 'AAAA-MM-DD'. */
export type Day = string;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDay(d: string): Day {
  if (!DAY_RE.test(d)) throw new Error(`Dia inválido: ${d}`);
  return d;
}

/** O dia civil em Lisboa para um instante. */
export function lisbonDay(now: Date = new Date()): Day {
  // en-CA formata como AAAA-MM-DD, que é o que queremos.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 'AAAA-MM-DD' → Date à meia-noite UTC, que é como o Prisma lê/grava `@db.Date`. */
export function dayToDate(d: Day): Date {
  return new Date(`${assertDay(d)}T00:00:00.000Z`);
}

/** Date vinda de uma coluna `@db.Date` → 'AAAA-MM-DD'. */
export function dateToDay(d: Date): Day {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Day, n: number): Day {
  const t = dayToDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return dateToDay(t);
}

/** Número de dias de `from` (inclusive) a `to` (exclusive). Nunca negativo. */
export function daysBetween(from: Day, to: Day): number {
  const ms = dayToDate(to).getTime() - dayToDate(from).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Seis casas, como a coluna. */
export function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

/** Duas casas, meio cêntimo para cima. Mesma regra do `cents` partilhado. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** O ganho de um dia. */
export function dailyGain(principal: number, annualRatePct: number): number {
  return round6((principal * annualRatePct) / 100 / 365);
}

// ─── Taxas ao longo do tempo ────────────────────────────────────────────────

export interface RatePoint {
  effectiveFrom: Day;
  annualRate: number;
}

/**
 * A taxa em vigor num dia: a última entrada com `effectiveFrom <= dia`.
 *
 * Sem nenhuma entrada anterior ao dia, usa a primeira. Não deve acontecer —
 * o plano nasce com uma linha no dia da criação e ninguém aplica antes disso
 * — mas se acontecer, render à taxa inicial é melhor do que render zero.
 */
export function rateOn(history: RatePoint[], day: Day): number {
  if (history.length === 0) throw new Error('Plano sem histórico de taxas.');
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let rate = sorted[0].annualRate;
  for (const r of sorted) {
    if (r.effectiveFrom <= day) rate = r.annualRate;
    else break;
  }
  return rate;
}

// ─── Os dias que faltam pagar ───────────────────────────────────────────────

export interface AccrualDay {
  day: Day;
  annualRate: number;
  amount: number;
}

/**
 * Os dias ainda por pagar a uma aplicação, até `untilExclusive`.
 *
 * Começa no dia a seguir a `accruedThrough` (ou em `startDate`, se nenhum foi
 * pago) e pára antes de `untilExclusive`. Nos fixos, `untilExclusive` nunca
 * passa da data de vencimento — quem chama garante isso com `accrualEnd`.
 *
 * Devolve lista vazia se não houver nada a pagar. Chamar duas vezes com os
 * mesmos dados dá o mesmo resultado; o que impede pagar duas vezes é a
 * restrição única (aplicação, dia) na base, não esta função.
 */
export function pendingAccruals(args: {
  principal: number;
  startDate: Day;
  accruedThrough: Day | null;
  untilExclusive: Day;
  /** Taxa de um dia: fixa (sempre a mesma) ou do histórico do plano. */
  rateForDay: (day: Day) => number;
}): AccrualDay[] {
  const first = args.accruedThrough ? addDays(args.accruedThrough, 1) : args.startDate;
  const out: AccrualDay[] = [];
  for (let d = first; d < args.untilExclusive; d = addDays(d, 1)) {
    const annualRate = args.rateForDay(d);
    out.push({ day: d, annualRate, amount: dailyGain(args.principal, annualRate) });
  }
  return out;
}

/**
 * Até onde uma aplicação rende hoje (exclusive).
 *
 * Flexível: até hoje — rende até ontem. Fixo: até hoje ou até ao vencimento,
 * o que vier primeiro — depois do vencimento não rende mais.
 */
export function accrualEnd(today: Day, maturityDate: Day | null): Day {
  if (maturityDate && maturityDate < today) return maturityDate;
  return today;
}

// ─── O resgate ──────────────────────────────────────────────────────────────

export type CloseReason = 'MATURED' | 'EARLY' | 'WITHDRAWN';

export interface PayoutResult {
  reason: CloseReason;
  principal: number;
  /** Ganhos arredondados ao cêntimo. */
  gains: number;
  penalty: number;
  /** O que volta ao saldo principal. */
  payout: number;
}

/**
 * Quanto volta ao saldo num resgate feito `today`.
 *
 * `accrued` já deve incluir todos os dias até ontem (ou até ao vencimento):
 * quem chama paga os dias em falta antes de pedir isto.
 */
export function computePayout(args: {
  planType: 'FIXED' | 'FLEXIBLE';
  principal: number;
  accrued: number;
  penaltyRatePct: number | null;
  maturityDate: Day | null;
  today: Day;
}): PayoutResult {
  const gains = round2(args.accrued);

  let reason: CloseReason = 'WITHDRAWN';
  let penalty = 0;

  if (args.planType === 'FIXED') {
    const matured = !!args.maturityDate && args.today >= args.maturityDate;
    if (matured) {
      reason = 'MATURED';
    } else {
      reason = 'EARLY';
      penalty = round2((args.principal * (args.penaltyRatePct ?? 0)) / 100);
    }
  }

  return {
    reason,
    principal: round2(args.principal),
    gains,
    penalty,
    payout: round2(args.principal + gains - penalty),
  };
}
