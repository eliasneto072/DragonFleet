// src/modules/extratos/bancos/millennium.ts
//
// O «EXTRATO COMBINADO» do Millennium BCP.
//
// ─── O CASO MAIS DIFÍCIL DOS CINCO ──────────────────────────────────────────
//
// Depois de o PDF ser convertido em texto, uma linha de movimento fica assim:
//
//     8.038.03 REGULARIZA. INCUMPRIMENTO      3597955052 504.287.62
//
// Está tudo colado. Lá dentro estão QUATRO campos:
//
//     data lançamento   8.03
//     data valor        8.03
//     grandeza        504.28
//     saldo             7.62
//
// O gerador de PDF do banco escreve as colunas sem espaço entre elas, e o
// espaçamento que o olho vê no papel vem da posição e não de um caractere.
//
// ─── COMO É QUE ISTO SE DESCOLA SEM ADIVINHAR ───────────────────────────────
//
// Pelas duas casas decimais. Em euros, cada número acaba em ponto e dois
// dígitos, e o separador de milhares neste banco é um ESPAÇO («23 219.95»),
// nunca um ponto. Então `504.287.62` só pode partir-se num sítio:
//
//     (\d+\.\d{2})(\d+\.\d{2})$   →   «504.28» e «7.62»
//
// O mesmo para as datas: `(\d{1,2}\.\d{2})(\d{1,2}\.\d{2})`.
//
// E não se fica por aí: o par descolado é conferido contra a cadeia de
// saldos. Se a separação tivesse caído no sítio errado, o saldo não dava.
//
// ─── AS DATAS SÃO MÊS.DIA, E NÃO TRAZEM ANO ─────────────────────────────────
//
// «8.03» é 3 de Agosto. O ano está no cabeçalho («EXTRATO DE 2026/08/03 A
// 2026/08/31») e é de lá que vem — ver a nota em `numeros.ts` sobre porque é
// que adivinhar o ano corrente estraga a importação de um extrato de Dezembro
// feita em Janeiro.
//
// ─── ESTE EXTRATO TRAZ UM CRÉDITO LÁ DENTRO ─────────────────────────────────
//
// O «EXTRATO COMBINADO» junta a conta à ordem com os empréstimos: capital
// vincendo, próximas prestações, TAN. Isso NÃO é lido aqui de propósito —
// este ficheiro responde a «que movimentos houve na conta». O que o crédito
// diz é assunto do ecrã dos créditos, e misturar as duas coisas num leitor
// dava um ficheiro que ninguém se atreve a mexer.

import type { LeituraCrua, Movimento } from '../tipos';
import { valorDeExtrato, dataMesDia, fimDoIban } from '../numeros';
import { assinarPeloSaldo, recusaPorNaoBater } from '../assinar';

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();

/** As duas datas, coladas ou separadas: «8.038.03» ou «8.03 8.03». */
const DATAS = /^(\d{1,2}\.\d{1,2})\s?(\d{1,2}\.\d{1,2})\s/;

// ─── O NÚMERO NÃO PODE COMEÇAR A MEIO DE OUTRO ─────────────────────────────
//
// A linha é «REGULARIZA. INCUMPRIMENTO 3597955052 504.287.62». Sem a guarda,
// a expressão começava a ler no «052» do número de contrato e dava
// «052 504.28» — 52.504,28 € numa conta que tinha 511,90 €.
//
// O `(?<!\d)` obriga o valor a começar onde não há um dígito antes.
const DOIS_VALORES = /(?<!\d)(\d{1,3}(?: \d{3})*\.\d{2})(-?\d{1,3}(?: \d{3})*\.\d{2}-?)\s*$/;

/** Um valor só no fim da linha. */
const UM_VALOR = /(-?\d{1,3}(?: \d{3})*\.\d{2}-?)\s*$/;

export function ehMillennium(texto: string): boolean {
  return /millennium/i.test(texto)
    || /BCOMPTPL/.test(texto)
    || /Banco Comercial Portugu/i.test(texto);
}

export function lerMillennium(texto: string): LeituraCrua {
  const linhas = texto.split('\n').map(limpar).filter(Boolean);
  const avisos: string[] = [];

  // «EXTRATO DE 2026/08/03 A 2026/08/31»
  const periodoBruto = /EXTRATO DE\s*(\d{4})\/(\d{2})\/(\d{2})\s*A\s*(\d{4})\/(\d{2})\/(\d{2})/i
    .exec(texto);

  const ano = periodoBruto ? Number(periodoBruto[1]) : new Date().getUTCFullYear();
  if (!periodoBruto) {
    avisos.push(
      'Não foi possível ler o período deste extrato, por isso as datas podem ficar no ano errado. '
      + 'Confirme as datas antes de gravar.',
    );
  }

  const saldoDe = (rotulo: RegExp): number | null => {
    for (const l of linhas) {
      if (!rotulo.test(l)) continue;
      const m = UM_VALOR.exec(l);
      if (m) return valorDeExtrato(m[1]);
    }
    return null;
  };

  const saldoInicial = saldoDe(/^SALDO INICIAL/i);
  const saldoFinal = saldoDe(/^SALDO FINAL/i);

  const movimentos: Movimento[] = [];
  let recusa: string | null = null;
  let anterior = saldoInicial;

  for (const l of linhas) {
    const d = DATAS.exec(l);
    if (!d) continue;

    const resto = l.slice(d[0].length);
    const dois = DOIS_VALORES.exec(resto);
    if (!dois) {
      // Uma linha com datas mas sem par de valores não é um movimento da
      // conta à ordem: o extrato combinado traz também o detalhe do crédito,
      // com datas e UM valor por linha.
      continue;
    }

    const grandeza = valorDeExtrato(dois[1]);
    const saldo = valorDeExtrato(dois[2]);
    if (grandeza === null) continue;

    const { valor, bate } = assinarPeloSaldo(grandeza, anterior, saldo);
    if (!bate && recusa === null) {
      recusa = recusaPorNaoBater(movimentos.length + 1, grandeza, anterior, saldo);
    }

    const descricao = limpar(resto.slice(0, dois.index));
    // A referência do banco: o número de contrato ou de documento que o
    // Millennium mete no fim do descritivo.
    const ref = /\b(\d{8,})\b/.exec(descricao);

    movimentos.push({
      data: dataMesDia(d[2], ano) ?? dataMesDia(d[1], ano) ?? '',
      dataLancamento: dataMesDia(d[1], ano),
      descricao: limpar(descricao.replace(/\b\d{8,}\b/, '')) || descricao,
      valor,
      saldo,
      referencia: ref ? ref[1] : null,
    });

    anterior = saldo;
  }

  return {
    banco: 'MILLENNIUM',
    contaTerminadaEm: fimDoIban(texto),
    periodo: {
      de: periodoBruto ? `${periodoBruto[1]}-${periodoBruto[2]}-${periodoBruto[3]}` : null,
      ate: periodoBruto ? `${periodoBruto[4]}-${periodoBruto[5]}-${periodoBruto[6]}` : null,
    },
    movimentos,
    saldoInicial,
    saldoFinal,
    avisos,
    recusa,
  };
}
