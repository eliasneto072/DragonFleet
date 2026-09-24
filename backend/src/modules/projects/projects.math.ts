// src/modules/projects/projects.math.ts
//
// As contas dos projetos de investimento, sem base de dados.
//
// ─── O PROBLEMA CENTRAL: OS CÊNTIMOS DA DIVISÃO ─────────────────────────────
//
// Repartir 100,00 € por três investidores em partes iguais dá 33,333… cada.
// Arredondar cada um ao cêntimo dá 33,33 × 3 = 99,99 €, e falta um cêntimo.
// Uma vez não se nota. Todos os meses, durante seis anos, são setenta e dois
// cêntimos que a empresa fica a dever sem ninguém saber a quem — e as contas
// deixam de fechar.
//
// A solução é o MÉTODO DO MAIOR RESTO: dá-se a cada um a parte inteira em
// cêntimos, e os cêntimos que sobram vão, um a um, para quem ficou com o maior
// resto na divisão. A soma das partes é sempre exatamente o total. Com empate,
// desempata quem pôs mais; persistindo, o identificador — para o resultado não
// depender da ordem por que a base devolveu as linhas.
//
// ─── TUDO EM CÊNTIMOS ───────────────────────────────────────────────────────
//
// As funções trabalham em inteiros de cêntimos e não em euros com vírgula
// flutuante. 0,1 + 0,2 não é 0,3 em JavaScript, e num sítio onde se somam
// centenas de parcelas isso acaba por aparecer num total.

/** Euros → cêntimos, arredondado. */
export function toCents(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

/** Cêntimos → euros. */
export function toEuros(cents: number): number {
  return Math.round(cents) / 100;
}

/** Duas casas, meio cêntimo para cima. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ─── A repartição ───────────────────────────────────────────────────────────

export interface Share {
  id: string;
  /** Quanto este investidor pôs, em euros. */
  amount: number;
}

export interface Allocation {
  id: string;
  /** O que lhe cabe, em euros, já com os cêntimos do resto. */
  amount: number;
  /** A fração do total que ele representa, para o ecrã. */
  ratio: number;
}

/**
 * Reparte um valor pelas participações, na proporção do que cada um pôs.
 *
 * A soma das partes devolvidas é EXATAMENTE `total`, sem cêntimos perdidos nem
 * inventados. É a propriedade que interessa e está testada.
 *
 * Total zero ou negativo devolve zero a toda a gente — um mês em que o carro
 * deu prejuízo não cobra nada ao investidor. Quem decidiu isso foi o cliente:
 * o investidor participa no lucro, não no prejuízo corrente. A perda aparece
 * na liquidação, no valor que a venda der.
 */
export function allocate(total: number, shares: Share[]): Allocation[] {
  const base = shares.filter((s) => s.amount > 0);
  if (base.length === 0) return [];

  const somaEuros = base.reduce((s, x) => s + x.amount, 0);
  if (somaEuros <= 0) return [];

  const totalCents = toCents(Math.max(0, total));
  const somaCents = toCents(somaEuros);

  // Parte inteira e resto, por participação.
  const parcelas = base.map((s) => {
    const exato = (toCents(s.amount) * totalCents) / somaCents;
    const inteiro = Math.floor(exato);
    return { id: s.id, amount: s.amount, inteiro, resto: exato - inteiro };
  });

  let sobra = totalCents - parcelas.reduce((s, p) => s + p.inteiro, 0);

  // Maior resto primeiro; empate desfeito por quem pôs mais, depois pelo id.
  // O desempate pelo id existe para o resultado não depender da ordem por que
  // a base devolveu as linhas — sem ele, o mesmo mês recalculado podia dar um
  // cêntimo a pessoa diferente.
  const ordenadas = [...parcelas].sort((a, b) =>
    b.resto - a.resto || b.amount - a.amount || a.id.localeCompare(b.id));

  for (let i = 0; sobra > 0; i = (i + 1) % ordenadas.length) {
    ordenadas[i].inteiro += 1;
    sobra -= 1;
  }

  return parcelas.map((p) => ({
    id: p.id,
    amount: toEuros(p.inteiro),
    ratio: toCents(p.amount) / somaCents,
  }));
}

// ─── O lucro de um mês ──────────────────────────────────────────────────────

export interface PeriodInput {
  /** Comissão que a empresa cobrou nos fechos desse mês. */
  commissionTotal: number;
  /** Aluguer da viatura cobrado nos mesmos fechos. */
  vehicleFeeTotal: number;
  /** Despesas do carro lançadas à mão (seguro, revisão, pneus). */
  expensesTotal: number;
  /** A fatia dos investidores, em percentagem. */
  profitSharePct: number;
  includeCommission: boolean;
  includeVehicleFee: boolean;
}

export interface PeriodResult {
  profit: number;
  investorsAmount: number;
}

/**
 * O lucro do mês e a fatia dos investidores.
 *
 * Combustível e portagens não entram: são adiantados pela empresa e
 * descontados ao motorista no mesmo fecho, portanto o efeito é nulo. Contá-los
 * como custo sem contar o que foi recuperado daria um prejuízo que não existe.
 *
 * A fatia dos investidores nunca é negativa. Um mês de prejuízo distribui zero
 * — não cobra ao investidor.
 */
export function computePeriod(input: PeriodInput): PeriodResult {
  const receita =
    (input.includeCommission ? toCents(input.commissionTotal) : 0)
    + (input.includeVehicleFee ? toCents(input.vehicleFeeTotal) : 0);

  const lucroCents = receita - toCents(input.expensesTotal);
  const fatiaCents = lucroCents > 0
    ? Math.round((lucroCents * input.profitSharePct) / 100)
    : 0;

  return { profit: toEuros(lucroCents), investorsAmount: toEuros(fatiaCents) };
}

// ─── Meses ──────────────────────────────────────────────────────────────────

/** 'AAAA-MM' de uma data, em Lisboa. */
export function monthOf(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit',
  }).format(d).slice(0, 7);
}

/** 'AAAA-MM' → o dia 1 desse mês, à meia-noite UTC (como o Prisma lê `@db.Date`). */
export function monthStart(month: string): Date {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Mês inválido: ${month}`);
  return new Date(`${month}-01T00:00:00.000Z`);
}

/** O dia 1 do mês seguinte. Serve de limite superior exclusivo nas consultas. */
export function nextMonthStart(month: string): Date {
  const d = monthStart(month);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Date de uma coluna `@db.Date` → 'AAAA-MM'. */
export function dateToMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/**
 * Os meses de `from` (inclusive) até `to` (inclusive), em ordem.
 *
 * Usado para saber que meses de um projeto ainda estão por apurar. Limitado a
 * 600 iterações — cinquenta anos — para uma data mal escrita não pendurar o
 * servidor num ciclo praticamente infinito.
 */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = monthStart(from);
  const fim = monthStart(to);
  for (let i = 0; d <= fim && i < 600; i += 1) {
    out.push(d.toISOString().slice(0, 7));
    d = new Date(d);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

// ─── A liquidação ───────────────────────────────────────────────────────────

export interface LiquidationResult {
  /** Quanto do valor da venda pertence aos investidores. */
  investorsTotal: number;
  /** A fração do carro que eles financiaram. */
  ownership: number;
  perShare: Allocation[];
}

/**
 * O que volta a cada investidor quando o projeto fecha.
 *
 * Os investidores são donos da fração do carro que financiaram: se a meta era
 * 20 000 € e eles puseram 15 000 €, são donos de 75%, e é 75% do valor da
 * venda que se reparte. O resto é da empresa, que pôs os outros 5 000 €.
 *
 * Pode devolver menos do que foi investido — se o carro se desvalorizou, a
 * perda é deles na mesma proporção em que teria sido o ganho. É a contrapartida
 * de terem recebido lucros durante todo o tempo sem que isso abatesse o
 * capital.
 *
 * Sem venda (`saleAmount` nulo), devolve-se o capital tal como entrou: é o caso
 * do projeto que chega ao prazo com o carro a continuar na frota.
 */
export function computeLiquidation(args: {
  targetAmount: number;
  raisedAmount: number;
  saleAmount: number | null;
  shares: Share[];
}): LiquidationResult {
  const ownership = args.targetAmount > 0
    ? Math.min(1, args.raisedAmount / args.targetAmount)
    : 1;

  const investorsTotal = args.saleAmount === null
    ? round2(args.raisedAmount)
    : round2(args.saleAmount * ownership);

  return {
    investorsTotal,
    ownership,
    perShare: allocate(investorsTotal, args.shares),
  };
}

// ─── A subscrição ───────────────────────────────────────────────────────────

export type SubscriptionError =
  | 'NOT_POSITIVE'
  | 'BELOW_MIN'
  | 'EXCEEDS_TARGET'
  | 'INSUFFICIENT';

/**
 * Valida uma subscrição contra o que falta angariar e o que o investidor tem.
 *
 * `available` já vem descontado dos pedidos de resgate pendentes e do que está
 * noutros projetos — a view trata disso. Sem esse desconto, dava para
 * subscrever duas vezes o mesmo dinheiro.
 */
export function checkSubscription(args: {
  amount: number;
  minTicket: number;
  targetAmount: number;
  raisedAmount: number;
  available: number;
}): { ok: true; amount: number } | { ok: false; reason: SubscriptionError; falta?: number } {
  const amount = round2(args.amount);
  if (!(amount > 0)) return { ok: false, reason: 'NOT_POSITIVE' };

  if (args.minTicket > 0 && toCents(amount) < toCents(args.minTicket)) {
    return { ok: false, reason: 'BELOW_MIN' };
  }

  const falta = round2(args.targetAmount - args.raisedAmount);
  if (toCents(amount) > toCents(falta)) {
    return { ok: false, reason: 'EXCEEDS_TARGET', falta: Math.max(0, falta) };
  }

  if (toCents(amount) > toCents(args.available)) {
    return { ok: false, reason: 'INSUFFICIENT' };
  }

  return { ok: true, amount };
}
