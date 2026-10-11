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
// Também não desconta combustível, portagens, nem os impostos dela. Só mostra
// o que a DragonFleet cobra. Pôr lá um valor de combustível inventado dava um
// líquido falso com ar de exacto.

/** O que se cobra a quem traz carro próprio. */
export const CARRO_PROPRIO = {
  /** Percentagem sobre o bruto. */
  comissao: 6,
  /** Slot semanal, em euros. */
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
  /** A comissão, em euros. */
  comissao: number;
  /** O slot semanal, em euros. */
  slot: number;
  /** O que cobramos, somado. */
  totalCobrado: number;
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

  const comissao = aCentimos(b * (CARRO_PROPRIO.comissao / 100));
  const slot = CARRO_PROPRIO.slotSemanal;
  const totalCobrado = aCentimos(comissao + slot);
  const bruto_liquido = aCentimos(b - totalCobrado);

  return {
    bruto: b,
    comissao,
    slot,
    totalCobrado,
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
    comissao: 0,
    slot: aCentimos(a),
    totalCobrado: aCentimos(a),
    liquido: Math.max(0, liquido),
    abaixoDoMinimo: b > 0 && liquido < 0,
  };
}

/** O mesmo valor, por mês. Ver `SEMANAS_POR_MES`. */
export function porMes(valorSemanal: number): number {
  return aCentimos(valorSemanal * SEMANAS_POR_MES);
}
