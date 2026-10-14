// src/features/landing/calculadora.ts
//
// As contas da calculadora de ganhos.
//
// ─── PORQUE É QUE ISTO ESTÁ SEPARADO DA TELA ────────────────────────────────
//
// Porque é dinheiro mostrado a um cliente que ainda não assinou nada. Um
// cêntimo a mais na coluna dele é uma promessa que não se cumpre na primeira
// semana; um a menos afasta alguém por engano. Separado, testa-se em três
// linhas por caso — e os casos que interessam são os das pontas: faturação
// zero, faturação abaixo do slot, números que não são números.
//
// ─── O QUE ESTA CALCULADORA NÃO FAZ, E DIZ QUE NÃO FAZ ──────────────────────
//
// Não estima quanto alguém vai faturar. O valor bruto é ESCRITO pela pessoa:
// "mete o que achas que fazes". Nós não sabemos quantas horas ela vai fazer,
// em que zona, em que época — e inventar esse número era a única parte desta
// página que podia virar-se contra ti.
//
// Também não desconta combustível nem portagens. Mostra o que sai do bruto no
// fecho semanal — o imposto e o slot — e mais nada. Pôr lá um valor de
// combustível inventado dava um líquido falso com ar de exacto.

/**
 * O que se desconta a quem traz carro próprio.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  OS 6% SÃO IMPOSTO, E NÃO COMISSÃO. A DIFERENÇA IMPORTA.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Isto esteve escrito como `comissao` e a tela chamava-lhe «Comissão
 * DragonFleet». Estava errado, e errado nos dois sentidos ao mesmo tempo:
 *
 *  · fazia a frota parecer quase o dobro mais cara do que é, afastando
 *    motoristas por um número que não era verdade;
 *  · e chamava «nosso» a dinheiro que é imposto sobre a faturação — o género
 *    de coisa que, descoberta depois de alguém assinar, leva atrás a
 *    confiança em tudo o resto.
 *
 * É a mesma taxa de 6% que o fecho semanal aplica, na mesma base: o bruto da
 * Uber e da Bolt. Ver o campo `taxRate` em `WeeklySettlement`.
 *
 * A comissão da empresa é OUTRA COISA, e existe à parte: é um campo do fecho
 * que cada frota define como quiser. Para estes motoristas está a zero, e por
 * isso não aparece aqui.
 */
export const CARRO_PROPRIO = {
  /** Imposto, em percentagem sobre o bruto. */
  imposto: 6,
  /** Slot semanal, em euros. Este fica mesmo para a frota. */
  slotSemanal: 50,
};

/**
 * Quantas semanas tem um mês, para a vista mensal.
 *
 * 52 semanas a dividir por 12 meses. Não é 4: com 4, um ano dava 48 semanas e
 * o valor mensal ficava sistematicamente abaixo do real — que é o erro que
 * desta vez até jogava a nosso favor, e por isso é o mais fácil de deixar
 * passar.
 */
export const SEMANAS_POR_MES = 52 / 12;

export interface Conta {
  /** O que a pessoa escreveu. */
  bruto: number;
  /** O imposto sobre o bruto, em euros. Ver `CARRO_PROPRIO`. */
  imposto: number;
  /** O slot semanal, em euros. */
  slot: number;
  /** Tudo o que sai do bruto, somado: imposto mais slot ou aluguer. */
  totalDescontado: number;
  /** O que lhe fica, antes dos custos dela. Nunca negativo — ver abaixo. */
  liquido: number;
  /**
   * `true` quando o bruto não chega para cobrir o que cobramos.
   *
   * A tela precisa de saber para o DIZER em vez de mostrar um zero que parece
   * um erro de cálculo. Numa semana má isso acontece, e esconder não ajuda
   * ninguém — quem descobre isso depois de assinar descobre-o zangado.
   */
  abaixoDoMinimo: boolean;
}

/** Arredonda a cêntimos, sem o erro de vírgula flutuante do `Math.round` só. */
function aCentimos(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(Number((v * 100).toPrecision(12))) / 100;
}

/**
 * As contas de quem traz carro próprio.
 *
 * `bruto` é por semana. Negativo, vazio ou lixo conta como zero: é um campo
 * aberto numa página pública, e um NaN a propagar-se deixava a tela inteira
 * a dizer "NaN €".
 */
export function contaCarroProprio(bruto: number): Conta {
  const b = Number.isFinite(bruto) && bruto > 0 ? bruto : 0;

  const imposto = aCentimos(b * (CARRO_PROPRIO.imposto / 100));
  const slot = CARRO_PROPRIO.slotSemanal;
  const totalDescontado = aCentimos(imposto + slot);
  const bruto_liquido = aCentimos(b - totalDescontado);

  return {
    bruto: b,
    imposto,
    slot,
    totalDescontado,
    // Travado a zero: um líquido negativo numa página de vendas lê-se como
    // "ainda tens de pagar para trabalhar", e o que acontece de facto é que a
    // diferença fica em dívida e sai da semana seguinte. Isso explica-se ao
    // telefone, não num número a vermelho.
    liquido: Math.max(0, bruto_liquido),
    abaixoDoMinimo: b > 0 && bruto_liquido < 0,
  };
}

/**
 * As contas de quem leva carro da frota.
 *
 * O aluguer depende do carro, por isso é um valor que a pessoa escreve para
 * experimentar — e a tela diz, por palavras, que o valor a sério se diz ao
 * telefone. Não há percentagem neste caso.
 */
export function contaCarroDaFrota(bruto: number, aluguerSemanal: number): Conta {
  const b = Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
  const a = Number.isFinite(aluguerSemanal) && aluguerSemanal > 0 ? aluguerSemanal : 0;

  const liquido = aCentimos(b - a);

  return {
    bruto: b,
    // Sem imposto nesta coluna: quem leva carro da frota paga aluguer e mais
    // nada sai aqui. Se um dia passar a haver, é aqui que entra.
    imposto: 0,
    slot: aCentimos(a),
    totalDescontado: aCentimos(a),
    liquido: Math.max(0, liquido),
    abaixoDoMinimo: b > 0 && liquido < 0,
  };
}

/** O mesmo valor, por mês. Ver `SEMANAS_POR_MES`. */
export function porMes(valorSemanal: number): number {
  return aCentimos(valorSemanal * SEMANAS_POR_MES);
}
