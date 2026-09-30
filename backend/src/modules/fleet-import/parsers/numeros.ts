// src/modules/fleet-import/parsers/numeros.ts
//
// Ler um número escrito por outra pessoa.
//
// ─── PORQUE É QUE ISTO TEM FICHEIRO PRÓPRIO ─────────────────────────────────
//
// Porque é o sítio onde estes importadores falham em silêncio. Os três
// fornecedores não escrevem os números da mesma maneira:
//
//   Via Verde      63.99        ponto decimal
//   Prio Frota     99,9100      vírgula decimal, quatro casas
//   Prio Electric  6.79         ponto decimal
//
// E qualquer um deles pode passar a escrever 1.234,56 no dia em que um valor
// ultrapassar o milhar — o que acontece sem aviso, numa semana com mais
// viagens. Um `parseFloat` ingénuo lê 1.234,56 como **1,23 €**, e isso não
// rebenta nada: entra no fecho, o motorista recebe a mais, e ninguém liga uma
// coisa à outra seis meses depois.
//
// A regra: **manda o separador mais à direita**. É ele o decimal, em qualquer
// das convenções. O outro é de milhares e deita-se fora.

/**
 * "1.234,56" e "1,234.56" dão ambos 1234.56.
 *
 * Devolve `null` em vez de `NaN` quando não consegue: `NaN` propaga-se em
 * silêncio por somas inteiras e só aparece no fim, já sem se saber de onde
 * veio.
 */
export function numeroPt(bruto: string): number | null {
  const s = (bruto ?? '').trim().replace(/\s|€/g, '');
  if (!s || !/[\d]/.test(s)) return null;
  if (!/^-?[\d.,]+$/.test(s)) return null;

  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');

  let normalizado: string;
  if (ultimaVirgula === -1 && ultimoPonto === -1) {
    normalizado = s;
  } else if (ultimaVirgula > ultimoPonto) {
    // A vírgula está mais à direita: é o decimal, os pontos são milhares.
    normalizado = s.replace(/\./g, '').replace(',', '.');
  } else {
    // O ponto está mais à direita: é o decimal, as vírgulas são milhares.
    normalizado = s.replace(/,/g, '');
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Ao cêntimo. Somar dezenas de linhas em vírgula flutuante deixa resíduo. */
export function cent(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Soma ao cêntimo, arredondando a cada passo.
 *
 * Somar tudo e arredondar no fim dá, em ficheiros com muitas linhas, um
 * resultado diferente de arredondar a cada linha — e é o segundo que tem de
 * bater com o total que o fornecedor imprimiu, porque foi assim que ele o fez.
 */
export function somaCent(valores: number[]): number {
  return valores.reduce((acc, v) => cent(acc + v), 0);
}

/**
 * A matrícula portuguesa nos três formatos que circulam: AA-00-00, 00-AA-00 e
 * 00-00-AA. Aceita letras e dígitos em qualquer dos pares porque os três
 * fornecedores escrevem-nas todas em maiúsculas com hífen, e distinguir mais
 * do que isso só criaria maneiras de não reconhecer uma matrícula válida.
 */
export const MATRICULA = /\b([A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2})\b/;
