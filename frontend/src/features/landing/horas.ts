// src/features/landing/horas.ts
//
// A conta das horas que o gestor perde por semana em papelada.
//
// ─── PORQUE É QUE ESTA CALCULADORA SÓ CONTA HORAS ───────────────────────────
//
// Porque as horas são dele e nós não as inventamos. A outra versão desta
// secção — "um carro parado três dias custa-te X" — era mais agressiva e
// também mais frágil: obrigava-nos a afirmar quanto rende um carro, com que
// frequência isso acontece, e durante quantos dias. Três números que variam
// de frota para frota e que, errados numa página pública, passam a ser a
// razão por que ninguém acredita no resto.
//
// Horas de fecho, não. Ele sabe quantas são, porque as passa. Nós só
// multiplicamos por 52 e dizemos quantos dias de trabalho são — que é a
// mesma coisa dita de uma maneira que se sente.
//
// ─── E O DINHEIRO? ──────────────────────────────────────────────────────────
//
// Só aparece se ele escrever quanto vale a hora dele. Sem esse campo
// preenchido, a tela não mostra euros nenhuns: um valor por hora assumido por
// nós seria um número nosso a fingir que era dele.

/** 52, e não 48. O ano tem 52 semanas e o fecho faz-se em todas. */
export const SEMANAS_POR_ANO = 52;

/**
 * Oito horas é um dia de trabalho.
 *
 * É a conversão que faz a conta doer: "208 horas por ano" não diz nada a
 * ninguém, "26 dias de trabalho por ano" diz tudo.
 */
export const HORAS_POR_DIA = 8;

/**
 * Tetos. São campos abertos numa página pública, e alguém vai escrever 99999
 * só para ver o que acontece.
 *
 * 80 horas por semana já é mais do que uma semana inteira de trabalho; e
 * acima de 500 € por hora a tela deixa de ser uma calculadora e passa a ser
 * uma piada. Limitar é melhor do que mostrar um número absurdo com a nossa
 * marca ao lado.
 */
export const MAX_HORAS = 80;
export const MAX_VALOR_HORA = 500;

export interface ContaDeHoras {
  /** O que ele escreveu, já dentro dos limites. */
  horasPorSemana: number;
  horasPorAno: number;
  /** Dias de 8 horas, com uma casa decimal. */
  diasPorAno: number;
  /** 0 quando ele não escreveu quanto vale a hora dele. */
  custoPorAno: number;
  /** A tela usa isto para decidir se mostra euros. */
  temCusto: boolean;
}

/**
 * Lixo conta como zero.
 *
 * Um NaN daqui propagava-se e a secção inteira ficava a dizer "NaN horas", o
 * que é pior do que não ter calculadora.
 */
function limpo(valor: number, maximo: number): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return Math.min(valor, maximo);
}

export function contaDeHoras(horasPorSemana: number, valorHora = 0): ContaDeHoras {
  const h = limpo(horasPorSemana, MAX_HORAS);
  const v = limpo(valorHora, MAX_VALOR_HORA);

  const horasPorAno = h * SEMANAS_POR_ANO;

  // Em cêntimos inteiros e só depois a dividir, como no resto do sistema: as
  // horas podem ser 2,5 e o valor 7,35, e 2,5 × 52 × 7,35 em vírgula
  // flutuante dá 955,5000000000001.
  const custoPorAno = Math.round(horasPorAno * v * 100) / 100;

  return {
    horasPorSemana: h,
    horasPorAno: Math.round(horasPorAno * 10) / 10,
    diasPorAno: Math.round((horasPorAno / HORAS_POR_DIA) * 10) / 10,
    custoPorAno,
    temCusto: v > 0 && h > 0,
  };
}
