// src/modules/extratos/bancos/revolut.ts
//
// Os extratos da Revolut: a conta pessoal e a Revolut Business.
//
// ─── DOIS FICHEIROS DO MESMO BANCO, E DUAS CONVENÇÕES DE NÚMEROS ────────────
//
//   Business:   «€1 000.00»   euro ANTES,  PONTO decimal,  espaço nos milhares
//   Pessoal:    «12 042,75€»  euro DEPOIS, VÍRGULA decimal, espaço nos milhares
//
// O mesmo banco, o mesmo mês, e nenhuma das duas convenções é a da outra. Um
// leitor só, com uma expressão «suficientemente permissiva», lia «1 000.00»
// como mil ou como um — e as duas leituras são números plausíveis.
//
// Por isso o formato é DECIDIDO primeiro (pelo cabeçalho) e só depois se lê. A
// permissividade é o que faz estes importadores falharem em silêncio.
//
// ─── A ORDEM DAS LINHAS É AO CONTRÁRIO NUM E NÃO NO OUTRO ───────────────────
//
// O extrato Business vem do mais RECENTE para o mais antigo; o pessoal vem por
// ordem cronológica. A cadeia de saldos só fecha na ordem do tempo, por isso o
// Business é invertido antes de ser conferido. Sem isso, a cadeia falhava num
// extrato perfeitamente correcto.
//
// ─── A LINHA DO CÂMBIO É UMA ARMADILHA ──────────────────────────────────────
//
//     02/10/2026  Render                                14,13€    37,01€
//                 Taxa Revolut 1,00€ = 1,12$            15,80$
//                 Para: Render.com, Render.com, CA
//
// A segunda linha tem um valor — «15,80$» — que NÃO é um movimento: é o mesmo
// pagamento visto em dólares. Uma expressão que apanhe «linha com número»
// importava-o como uma despesa de 15,80 € e a conta ficava com um movimento a
// mais que o banco não tem.
//
// A defesa é dupla: só contam linhas que COMEÇAM por uma data, e um valor em
// moeda que não seja o euro é ignorado. A cadeia de saldos apanharia o engano
// de qualquer maneira, mas é melhor não o cometer.

import type { Banco, LeituraCrua, Movimento } from '../tipos';
import { valorDeExtrato, dataDiaMesAno, dataComMesEmPalavra, fimDoIban } from '../numeros';
import { assinarPeloSaldo, recusaPorNaoBater } from '../assinar';

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();

// ─── O FORMATO É ESCOLHIDO, NÃO ADIVINHADO ─────────────────────────────────
//
// A primeira versão aceitava o euro de qualquer um dos lados e «dígitos,
// espaços, pontos e vírgulas» pelo meio. Pareceu razoável até encontrar isto:
//
//     11 set. 2026  CAR A16  €0.65  €728.11
//
// O «16» de «A16», seguido de espaço e de «€», encaixa na forma «número com o
// euro depois». O leitor leu um movimento de 16,00 € com saldo 0,65 €, a
// cadeia de saldos rebentou, e o extrato foi recusado — por causa do nome de
// uma auto-estrada.
//
// A correcção não é tornar a expressão mais esperta: é torná-la ESTRITA. Cada
// ficheiro tem uma convenção só, e exige-se:
//
//   · duas casas decimais, sempre — é dinheiro;
//   · o euro no lado certo para aquele ficheiro;
//   · nada alfanumérico imediatamente antes do número.
//
// Com isso, «A16 €0.65» tem exactamente um valor, que é o que está lá.
const MILHARES = String.raw`(?:[ \u00a0\u202f]\d{3})*`;

/**
 * Business: «€1 000.00» — euro antes, ponto decimal.
 *
 * O menos pode vir dos DOIS lados do símbolo: o saldo negativo escreve-se
 * «-€31.51» e a saída de dinheiro do resumo escreve-se «- €3 109.51». Sem o
 * primeiro `-?`, um saldo negativo era lido como positivo — e nesse extrato
 * havia um: a comissão de 35 € deixou a conta a −31,51 € durante um dia.
 */
const EURO_ANTES = String.raw`-?\s?€\s?-?\d{1,3}${MILHARES}[.,]\d{2}`;

/** Pessoal: «12 042,75€» — euro depois, vírgula decimal. */
const EURO_DEPOIS = String.raw`(?<![\w\d])-?\d{1,3}${MILHARES}[.,]\d{2}\s?€`;

/** Um valor noutra moeda: «15,80$», «$15.80». Existe para ser IGNORADO. */
const OUTRA_MOEDA = /[\d,.]\s?(?:\$|USD|GBP|£|CHF|PLN|BRL)\b|(?:\$|£)\s?\d/;

export function ehRevolut(texto: string): boolean {
  return /revolut/i.test(texto) || /REVOLT21/.test(texto);
}

export function ehRevolutBusiness(texto: string): boolean {
  return /Revolut Business/i.test(texto)
    || /Saldo de abertura/i.test(texto)
    || /Nome da conta/i.test(texto);
}

interface Linha { data: string; descricao: string; valores: string[] }

/** As linhas de movimento, cada uma com os valores em euros que traz. */
function lerLinhas(
  linhas: string[],
  data: (l: string) => string | null,
  forma: string,
): Linha[] {
  const out: Linha[] = [];

  for (const bruta of linhas) {
    const l = limpar(bruta);
    if (!l) continue;

    const d = data(l);
    if (!d) {
      // Continuação: «Referência: …», «Para: …», «Cartão: …». Entra no
      // descritivo, e os valores dela são ignorados — é aí que vive a linha
      // do câmbio.
      const ultimo = out[out.length - 1];
      if (ultimo && /^(Refer|Para|De|Cart|Taxa|IBAN|BIC)/i.test(l)) {
        ultimo.descricao = limpar(`${ultimo.descricao} ${l}`);
      }
      continue;
    }

    const valores = (l.match(new RegExp(forma, 'g')) ?? [])
      .filter((v) => !OUTRA_MOEDA.test(v));

    // Fora da descrição: os valores e a data que a abre. Sem tirar a data, o
    // descritivo ficava «3 set. 2026 MOA Dinheiro adicionado…» e a data
    // aparecia duas vezes no ecrã.
    const semValores = l.replace(new RegExp(forma, 'g'), ' ');
    const semData = semValores
      .replace(/^\s*\d{1,2}\s+(?:de\s+)?[a-zç]+\.?\s*(?:de\s+)?\d{4}/i, '')
      .replace(/^\s*\d{2}\/\d{2}\/\d{4}/, '');

    out.push({ data: d, descricao: limpar(semData) || limpar(semValores), valores });
  }

  return out;
}

function montar(
  banco: Banco,
  texto: string,
  linhas: Linha[],
  saldoInicial: number | null,
  saldoFinal: number | null,
  avisos: string[],
): LeituraCrua {
  const movimentos: Movimento[] = [];
  let recusa: string | null = null;
  let anterior = saldoInicial;

  for (const l of linhas) {
    // A ÚLTIMA coluna é o saldo; a penúltima é a grandeza. Quando só há um
    // valor, não há como separar os dois — e a linha é recusada em vez de
    // adivinhada.
    if (l.valores.length < 2) {
      if (l.valores.length === 1 && recusa === null) {
        recusa = `A linha de ${l.data} traz um valor só, sem saldo ao lado. `
          + 'Não há como confirmar. Nada foi importado.';
      }
      continue;
    }

    const saldo = valorDeExtrato(l.valores[l.valores.length - 1]);
    const grandeza = valorDeExtrato(l.valores[l.valores.length - 2]);
    if (grandeza === null) continue;

    const { valor, bate } = assinarPeloSaldo(grandeza, anterior, saldo);
    if (!bate && recusa === null) {
      recusa = recusaPorNaoBater(movimentos.length + 1, grandeza, anterior, saldo);
    }

    movimentos.push({
      data: l.data,
      // A Revolut não distingue data de lançamento e data valor.
      dataLancamento: null,
      descricao: l.descricao,
      valor,
      saldo,
      referencia: null,
    });

    anterior = saldo;
  }

  return {
    banco,
    contaTerminadaEm: fimDoIban(texto),
    periodo: {
      de: movimentos[0]?.data ?? null,
      ate: movimentos[movimentos.length - 1]?.data ?? null,
    },
    movimentos,
    saldoInicial,
    saldoFinal,
    avisos,
    recusa,
  };
}

export function lerRevolutBusiness(texto: string): LeituraCrua {
  const todas = texto.split('\n');

  const soValor = (re: RegExp): number | null => {
    const m = re.exec(texto);
    if (!m) return null;
    return valorDeExtrato(m[1]);
  };

  const abertura = soValor(new RegExp(String.raw`Saldo de abertura\s*(${EURO_ANTES})`, 'i'));
  const encerramento = soValor(new RegExp(String.raw`Saldo de encerramento\s*(${EURO_ANTES})`, 'i'));

  // Do mais recente para o mais antigo: inverte-se para a cadeia de saldos
  // poder ser conferida pela ordem do tempo.
  const linhas = lerLinhas(todas, dataComMesEmPalavra, EURO_ANTES).reverse();

  return montar('REVOLUT_BUSINESS', texto, linhas, abertura, encerramento, []);
}

export function lerRevolutPessoal(texto: string): LeituraCrua {
  const todas = texto.split('\n');

  // «Conta (Conta Corrente)  230,87€  12 042,75€  11 815,00€  3,12€»
  // O primeiro valor é o saldo inicial e o último o final. Os dois do meio
  // são os totais de saídas e entradas, que não se usam: somá-los dava uma
  // segunda conta do mesmo número, e duas contas do mesmo número divergem.
  const resumo = new RegExp(
    String.raw`^\s*(?:Total|Conta)\b[^€]*?(${EURO_DEPOIS})\s*(${EURO_DEPOIS})\s*(${EURO_DEPOIS})\s*(${EURO_DEPOIS})\s*$`,
    'im',
  ).exec(texto);

  const abertura = resumo ? valorDeExtrato(resumo[1]) : null;
  const encerramento = resumo ? valorDeExtrato(resumo[4]) : null;

  const linhas = lerLinhas(todas, (l) => {
    // Só uma data NO COMEÇO da linha conta como movimento novo.
    const m = /^(\d{2}\/\d{2}\/\d{4})\b/.exec(l);
    return m ? dataDiaMesAno(m[1]) : null;
  }, EURO_DEPOIS);

  return montar('REVOLUT', texto, linhas, abertura, encerramento, []);
}
