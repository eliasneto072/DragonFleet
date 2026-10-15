// src/modules/personal/plano.ts
//
// O plano de um crédito: quanto se paga em cada prestação, e quanto já se pagou.
//
// ─── DOIS CAMINHOS, À ESCOLHA EM CADA CRÉDITO ───────────────────────────────
//
// Foi a decisão dele, e é a razão de este ficheiro existir ao lado do
// `creditos.ts` em vez de o substituir:
//
//   PELA TAXA    — há uma TAN, e o quadro de amortização calcula-se como
//                  sempre. É o caso dos créditos de banco. Vive em
//                  `creditos.ts`, que já estava testado e não se toca.
//
//   PELO PLANO   — não há taxa nenhuma, ou não interessa. Há o capital que se
//                  pediu, o que se devolve no fim, e os valores das
//                  prestações por tramos. É o caso dos empréstimos de
//                  investidores particulares, que ele tem e que às vezes nem
//                  juros levam.
//
// ─── PORQUE É QUE O JURO NÃO SE CALCULA AQUI ────────────────────────────────
//
// Porque já está dado: é a diferença entre o que se devolve e o que se pediu.
// Deduzir uma taxa a partir disso seria inventar um número que o contrato não
// tem — e esse número apareceria no ecrã como se fosse do contrato.
//
// ─── PORQUE É QUE OS TRAMOS GUARDAM O INÍCIO E NÃO O INTERVALO ──────────────
//
// «A partir da prestação 1, 200 €. A partir da 13, 300 €.» Com intervalos
// (1–12, 13–24) é possível deixar um buraco ou sobrepor dois, e aí não há
// resposta para «quanto é a prestação 13». Com o início só, não é possível:
// cada prestação cai sempre em exactamente um tramo.

export interface Tramo {
  /** A partir de que prestação este valor vale. 1 é a primeira. */
  dePrestacao: number;
  valor: number;
}

export interface CreditoPorPlano {
  /** O que foi pedido. */
  capital: number;
  /** O que se devolve ao todo. Nulo quando ele ainda não o soube. */
  totalAPagar: number | null;
  prestacoes: number;
  inicio: Date;
  tramos: Tramo[];
  /** Guardado para conferir, nunca para calcular. */
  prestacaoDoContrato?: number | null;
}

export interface Pagamento {
  quando: Date;
  valor: number;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Os tramos pela ordem certa, sem repetidos, e começando sempre na 1.ª.
 *
 * Um plano cujo primeiro tramo comece na prestação 5 não diz quanto se paga
 * nas quatro primeiras. Em vez de recusar o crédito inteiro, o primeiro tramo
 * é puxado para a prestação 1: o número que ele escreveu passa a valer desde o
 * início, que é o que qualquer pessoa quer dizer quando escreve um tramo só.
 */
export function tramosOrdenados(tramos: Tramo[]): Tramo[] {
  const limpos = tramos
    .filter((t) => Number.isFinite(t.valor) && t.valor > 0)
    .map((t) => ({ dePrestacao: Math.max(1, Math.floor(t.dePrestacao)), valor: cent(t.valor) }))
    .sort((a, b) => a.dePrestacao - b.dePrestacao);

  // Dois tramos a começar na mesma prestação: fica o último escrito.
  const porInicio = new Map<number, Tramo>();
  for (const t of limpos) porInicio.set(t.dePrestacao, t);

  const ordenados = [...porInicio.values()].sort((a, b) => a.dePrestacao - b.dePrestacao);
  if (ordenados.length > 0 && ordenados[0].dePrestacao !== 1) {
    ordenados[0] = { ...ordenados[0], dePrestacao: 1 };
  }
  return ordenados;
}

/** Quanto se paga na prestação `n` (1 é a primeira). */
export function prestacaoNumero(tramos: Tramo[], n: number): number {
  const ordenados = tramosOrdenados(tramos);
  if (ordenados.length === 0) return 0;

  let valor = ordenados[0].valor;
  for (const t of ordenados) {
    if (t.dePrestacao <= n) valor = t.valor;
    else break;
  }
  return valor;
}

export interface LinhaDoPlano {
  numero: number;
  quando: Date;
  valor: number;
  /** O que já foi entregue até esta prestação, inclusive. */
  acumulado: number;
}

/** O mês `n` depois de `inicio`, no mesmo dia. */
function mesesDepois(inicio: Date, n: number): Date {
  const d = new Date(Date.UTC(
    inicio.getUTCFullYear(), inicio.getUTCMonth() + n, 1, 12, 0, 0, 0,
  ));
  // O dia 31 não existe em todos os meses: fica no último dia do mês.
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(inicio.getUTCDate(), ultimo));
  return d;
}

/**
 * O plano inteiro, prestação a prestação.
 *
 * ─── A ÚLTIMA PRESTAÇÃO LEVA O RESTO ──────────────────────────────────────
 *
 * Quando há um total a pagar, a soma das prestações tem de dar EXACTAMENTE
 * esse total. Os tramos são números redondos escritos à mão e quase nunca dão
 * certo ao cêntimo; a diferença vai toda para a última prestação, que é o que
 * os contratos fazem.
 *
 * Sem isto, o «já pago» chegava a 100,3% ou parava nos 99,7% — e uma barra que
 * não fecha em 100 faz desconfiar de tudo o resto.
 */
export function planoDoCredito(c: CreditoPorPlano): LinhaDoPlano[] {
  const n = Math.max(1, Math.floor(c.prestacoes));
  const tramos = tramosOrdenados(c.tramos);
  if (tramos.length === 0) return [];

  const linhas: LinhaDoPlano[] = [];
  let acumulado = 0;

  for (let i = 1; i <= n; i++) {
    let valor = prestacaoNumero(tramos, i);

    if (i === n && c.totalAPagar !== null) {
      const resto = cent(c.totalAPagar - acumulado);
      // Só se o resto fizer sentido: um total mal escrito não deve produzir
      // uma última prestação negativa ou absurda.
      if (resto > 0) valor = resto;
    }

    acumulado = cent(acumulado + valor);
    linhas.push({ numero: i, quando: mesesDepois(c.inicio, i - 1), valor, acumulado });
  }

  return linhas;
}

/** A soma do que o plano manda pagar ao todo. */
export function totalDoPlano(c: CreditoPorPlano): number {
  const linhas = planoDoCredito(c);
  return linhas.length === 0 ? 0 : linhas[linhas.length - 1].acumulado;
}

/**
 * O juro total: o que se devolve menos o que se pediu.
 *
 * Nulo quando ele ainda não escreveu o total — e nulo é a resposta honesta:
 * sem o total não há juro conhecido, e mostrar zero seria afirmar que o
 * crédito não tem juros.
 */
export function juroTotal(c: CreditoPorPlano): number | null {
  if (c.totalAPagar === null) return null;
  return cent(c.totalAPagar - c.capital);
}

/**
 * A percentagem do juro sobre o capital, ao todo e por ano.
 *
 * NÃO é uma TAN e não se chama TAN em lado nenhum: é só a conta directa de
 * quanto custa o dinheiro, que é o que ele quer ver num empréstimo sem taxa
 * declarada. Chamar-lhe TAN seria pôr no ecrã um número de contrato que não
 * existe no contrato.
 */
export function custoEmPercentagem(c: CreditoPorPlano): { total: number; porAno: number } | null {
  const juro = juroTotal(c);
  if (juro === null || c.capital <= 0) return null;

  const anos = Math.max(1 / 12, c.prestacoes / 12);
  const total = (juro / c.capital) * 100;
  return { total: Math.round(total * 100) / 100, porAno: Math.round((total / anos) * 100) / 100 };
}

export interface EstadoPorPagamentos {
  /** O que foi entregue, somado. */
  pago: number;
  /** O que falta entregar. Nunca negativo. */
  porPagar: number;
  /** De 0 a 100. */
  percentagem: number;
  /** Quantas prestações o que foi pago já cobre, por inteiro. */
  prestacoesPagas: number;
  /** Quantas já deviam estar pagas à data de hoje, pelo plano. */
  prestacoesDevidas: number;
  /** Quantas estão em atraso. Zero quando está em dia ou adiantado. */
  emAtraso: number;
  /** O valor em atraso. */
  valorEmAtraso: number;
  /** A data da última prestação do plano. */
  ultimoPagamento: Date | null;
  liquidado: boolean;
}

/**
 * O estado do crédito, a partir dos pagamentos REGISTADOS.
 *
 * ─── PORQUE É QUE NÃO SE CONTA PELOS MESES ────────────────────────────────
 *
 * Porque contar pelos meses assume que se pagou sempre a horas. Um dos
 * créditos dele tem uma prestação em atraso: contado pela data, aparecia como
 * se estivesse em dia — e era precisamente a informação que ele precisa de ter
 * à frente dos olhos que desaparecia.
 *
 * O atraso é a diferença entre o que o plano já devia ter cobrado à data de
 * hoje e o que está registado como pago.
 */
export function estadoPorPagamentos(
  c: CreditoPorPlano,
  pagamentos: Pagamento[],
  hoje: Date = new Date(),
): EstadoPorPagamentos {
  const linhas = planoDoCredito(c);
  const total = linhas.length === 0 ? 0 : linhas[linhas.length - 1].acumulado;

  const pago = cent(pagamentos.reduce((s, p) => s + (Number.isFinite(p.valor) ? p.valor : 0), 0));
  const porPagar = Math.max(0, cent(total - pago));

  const percentagem = total <= 0 ? 0
    : Math.min(100, Math.round((pago / total) * 1000) / 10);

  // Quantas prestações o que foi pago cobre por inteiro.
  let prestacoesPagas = 0;
  for (const l of linhas) {
    if (l.acumulado <= pago + 0.011) prestacoesPagas = l.numero;
    else break;
  }

  // Quantas já venceram.
  const devidas = linhas.filter((l) => l.quando.getTime() <= hoje.getTime());
  const prestacoesDevidas = devidas.length;
  const devidoAteHoje = devidas.length === 0 ? 0 : devidas[devidas.length - 1].acumulado;

  const valorEmAtraso = Math.max(0, cent(devidoAteHoje - pago));
  const emAtraso = Math.max(0, prestacoesDevidas - prestacoesPagas);

  return {
    pago,
    porPagar,
    percentagem,
    prestacoesPagas,
    prestacoesDevidas,
    emAtraso,
    valorEmAtraso,
    ultimoPagamento: linhas.length === 0 ? null : linhas[linhas.length - 1].quando,
    liquidado: total > 0 && porPagar <= 0.011,
  };
}

export interface PontoAcumulado {
  /** "AAAA-MM" */
  mes: string;
  /** O que o plano mandava ter pago até ao fim deste mês. */
  previsto: number;
  /** O que foi realmente pago até ao fim deste mês. Nulo depois de hoje. */
  pago: number | null;
}

const mesDe = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * A reta dos pagamentos acumulados: o previsto e o real, lado a lado.
 *
 * ─── PORQUE É QUE O REAL FICA NULO DEPOIS DE HOJE ─────────────────────────
 *
 * Porque desenhar zero no futuro faz a linha mergulhar a pique no mês
 * corrente, e isso lê-se como «parou de pagar» em vez de «ainda não chegou
 * lá». Nulo deixa a linha acabar onde o tempo acabou, que é a verdade.
 */
export function acumuladoPorMes(
  c: CreditoPorPlano,
  pagamentos: Pagamento[],
  hoje: Date = new Date(),
): PontoAcumulado[] {
  const linhas = planoDoCredito(c);
  if (linhas.length === 0) return [];

  const ordenados = [...pagamentos]
    .filter((p) => Number.isFinite(p.valor))
    .sort((a, b) => a.quando.getTime() - b.quando.getTime());

  const out: PontoAcumulado[] = [];
  let real = 0;
  let i = 0;
  const mesDeHoje = mesDe(hoje);

  for (const l of linhas) {
    const mes = mesDe(l.quando);
    // Tudo o que foi pago até ao fim deste mês.
    while (i < ordenados.length && mesDe(ordenados[i].quando) <= mes) {
      real = cent(real + ordenados[i].valor);
      i++;
    }
    out.push({ mes, previsto: l.acumulado, pago: mes <= mesDeHoje ? real : null });
  }

  return out;
}
