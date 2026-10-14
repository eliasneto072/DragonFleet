// src/modules/extratos/bancos/novo-banco.ts
//
// O «EXTRATO INTEGRADO» do Novo Banco.
//
// ─── O FORMATO ──────────────────────────────────────────────────────────────
//
//     05.09.26          SALDO ANTERIOR                              244,71
//     06.09.26 06.09.26 Compra Mb Cartão **** 085* Salty Beach Bar   40,00   204,71
//                       Praia Areia B                     ← resto do descritivo
//     08.09.26 08.09.26 Trf Imediata Sepa+ De Ana Maria ...  20,00   219,67
//
// Duas datas: a de LANÇAMENTO e a de VALOR. Não são iguais na viragem do mês —
// há linhas a 01.10 com data valor 30.09 — e é a data VALOR que decide em que
// mês a despesa entra.
//
// O débito e o crédito vêm em colunas separadas que o texto não distingue: as
// duas linhas acima acabam ambas em dois números positivos. O sinal sai da
// diferença de saldos, e a grandeza lida é conferida contra ela — ver a nota
// longa em `assinar.ts`.
//
// ─── O DESCRITIVO PARTE-SE, E A SEGUNDA LINHA NÃO TEM DATAS ─────────────────
//
// É isso que a distingue de um movimento novo: um movimento começa sempre com
// uma data. Uma linha sem data é a continuação do descritivo de cima.

import type { LeituraCrua, Movimento } from '../tipos';
import { valorDeExtrato, dataDiaMesAno } from '../numeros';
import { assinarPeloSaldo, recusaPorNaoBater } from '../assinar';
import { fimDoIban } from '../numeros';

const ESPACOS = String.raw`[\s   ]`;
const VALOR = String.raw`\d{1,3}(?:[.  ]\d{3})*,\d{2}`;

// ─── A LINHA NÃO COMEÇA SEMPRE NA DATA ─────────────────────────────────────
//
// O extrato tem texto escrito de lado na margem — «Processado por Computador»,
// «DN - Digital Banco Online» — e o extrator, que reconstrói as linhas pela
// posição, mete-o à frente de uma linha de movimento:
//
//     Processado por Computador 25.09.26 25.09.26 Trf ... 22,00 106,88
//
// Com a expressão ancorada no início, esse movimento era saltado — e um
// movimento a menos parte a cadeia de saldos. Foi a cadeia que o apanhou: deu
// 25,35 € de diferença numa linha, e os 22,00 € que faltavam estavam aqui.
//
// Então o par de datas é procurado em qualquer ponto da linha, e o que vier
// antes é deitado fora. O par «dd.mm.aa dd.mm.aa» é específico o suficiente
// para não aparecer dentro de um descritivo.
const LINHA = new RegExp(
  String.raw`(\d{2}\.\d{2}\.\d{2})${ESPACOS}+(\d{2}\.\d{2}\.\d{2})${ESPACOS}+`
  + String.raw`(.*?)${ESPACOS}+(${VALOR})${ESPACOS}+(-?${VALOR})${ESPACOS}*$`,
);

/** `dd.mm.aa SALDO ANTERIOR 244,71` — só uma data, e sem grandeza. */
const SALDO_ANTERIOR = new RegExp(
  String.raw`^(\d{2}\.\d{2}\.\d{2})${ESPACOS}+SALDO ANTERIOR${ESPACOS}+(-?${VALOR})`,
  'i',
);

const SALDO_FINAL = new RegExp(
  String.raw`SALDO (?:CONTABIL[ÍI]STICO|FINAL)${ESPACOS}+(-?${VALOR})`,
  'i',
);

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();

export function ehNovoBanco(texto: string): boolean {
  return /novo\s*banco/i.test(texto)
    || /BESCPTPL/.test(texto)
    || /EXTRATO\s+INTEGRADO\s+n[ºo]/i.test(texto);
}

export function lerNovoBanco(texto: string): LeituraCrua {
  const linhas = texto.split('\n');
  const avisos: string[] = [];

  const saldoInicial = (() => {
    for (const l of linhas) {
      const m = SALDO_ANTERIOR.exec(limpar(l));
      if (m) return valorDeExtrato(m[2]);
    }
    return null;
  })();

  const finalDeclarado = (() => {
    const m = SALDO_FINAL.exec(texto);
    return m ? valorDeExtrato(m[1]) : null;
  })();

  // «CONTA 26.31 DO nº 0001 0161 8947 de 05.09.2026 a 05.10.2026»
  const periodoBruto = /de\s+(\d{2}\.\d{2}\.\d{4})\s+a\s+(\d{2}\.\d{2}\.\d{4})/i.exec(texto);

  const movimentos: Movimento[] = [];
  let recusa: string | null = null;
  let anterior = saldoInicial;

  for (const bruta of linhas) {
    const l = limpar(bruta);
    if (!l) continue;

    const m = LINHA.exec(l);
    if (!m) {
      // Uma linha sem datas é a continuação do descritivo do movimento de
      // cima — desde que haja um movimento de cima e a linha não seja do
      // cabeçalho ou do rodapé.
      const ultimo = movimentos[movimentos.length - 1];
      if (ultimo && !/^\d{2}\.\d{2}\.\d{2}/.test(l)
          && !/^(SALDO|Data|CONTA|Extrato|MOVIMENTOS|P[ÁA]GINA|Processado)/i.test(l)
          && l.length <= 60) {
        ultimo.descricao = limpar(`${ultimo.descricao} ${l}`);
      }
      continue;
    }

    const grandeza = valorDeExtrato(m[4]);
    const saldo = valorDeExtrato(m[5]);
    if (grandeza === null) continue;

    const { valor, bate } = assinarPeloSaldo(grandeza, anterior, saldo);
    if (!bate && recusa === null) {
      recusa = recusaPorNaoBater(movimentos.length + 1, grandeza, anterior, saldo);
    }

    movimentos.push({
      data: dataDiaMesAno(m[2]) ?? dataDiaMesAno(m[1]) ?? '',
      dataLancamento: dataDiaMesAno(m[1]),
      descricao: limpar(m[3]),
      valor,
      saldo,
      // O Novo Banco não imprime uma referência por movimento. O descritivo e
      // a data fazem a chave de «já importei isto» — ver `duplicados.ts`.
      referencia: null,
    });

    anterior = saldo;
  }

  return {
    banco: 'NOVO_BANCO',
    contaTerminadaEm: fimDoIban(texto),
    periodo: {
      de: periodoBruto ? dataDiaMesAno(periodoBruto[1]) : null,
      ate: periodoBruto ? dataDiaMesAno(periodoBruto[2]) : null,
    },
    movimentos,
    saldoInicial,
    saldoFinal: finalDeclarado,
    avisos,
    recusa,
  };
}
