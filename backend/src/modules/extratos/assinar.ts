// src/modules/extratos/assinar.ts
//
// Saber se um valor entrou ou saiu, quando o extrato já não o diz.
//
// ─── O PROBLEMA ─────────────────────────────────────────────────────────────
//
// Três dos cinco bancos escrevem o débito e o crédito em COLUNAS SEPARADAS:
//
//     06.09.26  Compra Mb ... Salty Beach Bar    40,00            204,71
//     08.09.26  Trf Imediata Sepa+ De Ana ...             20,00   219,67
//
// Qual é a coluna de cada número vê-se pela POSIÇÃO no papel. Depois de o PDF
// ser convertido em linhas de texto, a posição desaparece: ficam «40,00
// 204,71» e «20,00 219,67», dois pares de números positivos indistinguíveis.
//
// Adivinhar pelo descritivo — «Compra» sai, «Trf ... De» entra — funciona até
// ao primeiro descritivo que não esteja na lista, e aí erra o SINAL, que é o
// pior engano possível: 40 € de despesa entram como 40 € de receita e a conta
// fica 80 € ao lado da verdade.
//
// ─── A SOLUÇÃO: O SALDO JÁ SABE ─────────────────────────────────────────────
//
// O extrato imprime o saldo depois de cada movimento. A diferença entre dois
// saldos seguidos dá o valor COM o sinal, exactamente, sem adivinhar nada:
//
//     244,71 → 204,71   =  −40,00
//     199,67 → 219,67   =  +20,00
//
// ─── E ISTO NÃO É CIRCULAR? ─────────────────────────────────────────────────
//
// Não, e é a parte que importa. O sinal vem do saldo, mas a GRANDEZA vem do
// texto — e as duas têm de coincidir. A verificação passa a ser:
//
//     | saldo_n − saldo_(n−1) |  ==  o número que foi lido na linha
//
// Um valor lido a mais, um a menos, um movimento saltado ou duas colunas
// trocadas fazem a igualdade falhar. Só o SINAL é deduzido; tudo o resto
// continua a ser conferido contra o que está impresso.
//
// Quando não bate, o leitor recusa o extrato inteiro. Não há «importar o que
// der»: metade de um extrato é pior do que nenhum, porque parece completo.

const cent = (n: number) => Math.round(n * 100) / 100;

/** Um cêntimo. Acima disto não é arredondamento. */
export const TOLERANCIA = 0.011;

export interface Assinado {
  /** O valor com sinal: negativo saiu, positivo entrou. */
  valor: number;
  /** A grandeza lida coincide com a diferença de saldos. */
  bate: boolean;
}

/**
 * Dá o sinal a uma grandeza, usando o saldo antes e depois.
 *
 * Sem saldo anterior (o primeiro movimento de um extrato que não declara o
 * saldo inicial) não há diferença a calcular: devolve-se a grandeza como saída
 * e `bate` falso, para o extrato ser recusado em vez de adivinhado.
 */
export function assinarPeloSaldo(
  grandeza: number,
  saldoAnterior: number | null,
  saldoAgora: number | null,
): Assinado {
  const g = Math.abs(cent(grandeza));

  if (saldoAnterior === null || saldoAgora === null) {
    return { valor: -g, bate: false };
  }

  const diferenca = cent(saldoAgora - saldoAnterior);
  if (Math.abs(Math.abs(diferenca) - g) > TOLERANCIA) {
    return { valor: diferenca, bate: false };
  }

  // Uma diferença de zero com uma grandeza de zero é um movimento de 0,00 €,
  // que existe (um estorno que se anula). O sinal é indiferente.
  return { valor: diferenca === 0 ? 0 : cent(Math.sign(diferenca) * g), bate: true };
}

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n || 0);

/** A frase que explica a recusa, para a pessoa saber onde olhar. */
export function recusaPorNaoBater(
  linha: number,
  grandeza: number,
  saldoAnterior: number | null,
  saldoAgora: number | null,
): string {
  if (saldoAnterior === null || saldoAgora === null) {
    return `Na linha ${linha} não há saldo com que confirmar o valor de ${eur(grandeza)}. `
      + 'Nada foi importado.';
  }
  return `Na linha ${linha} o extrato diz ${eur(grandeza)} mas o saldo passou de `
    + `${eur(saldoAnterior)} para ${eur(saldoAgora)}, uma diferença de `
    + `${eur(Math.abs(saldoAgora - saldoAnterior))}. Nada foi importado.`;
}
