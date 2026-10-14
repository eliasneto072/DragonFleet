// src/modules/extratos/bancos/abanca.ts
//
// O extrato de movimentos do ABANCA — a conta da empresa e a pessoal.
//
// ─── UM LEITOR PARA AS DUAS CONTAS ──────────────────────────────────────────
//
// O cliente achava que o extrato pessoal e o da empresa eram «ligeiramente
// diferentes». São o MESMO ficheiro: o mesmo gerador, as mesmas colunas, a
// mesma ordem. O que muda é a conta a que se referem, e isso lê-se do IBAN no
// cabeçalho.
//
// O que ele mandou como extrato pessoal era outra coisa — a folha de posições
// («EXTRATO INTEGRADO»), que lista saldos e cartões e não tem um único
// movimento. Esse caso é reconhecido e devolve zero movimentos com um aviso a
// dizer-lhe qual é a exportação certa, em vez de dizer «não encontrei nada».
//
// ─── O FORMATO ──────────────────────────────────────────────────────────────
//
// Cada movimento é uma linha com TRÊS datas, e o resto da informação espalhado
// por linhas em volta, porque a coluna «TIPO OPERAÇÃO» é estreita e parte as
// palavras:
//
//     Ordem                                                 ← parte do tipo
//     03/08/2026 03/08/2026 03/08/2026 Bolt Operations Ou 440,43 3 533,14 EUR
//     estrangeiro                                           ← resto do tipo
//
// A linha com as datas e os dois valores é a âncora. As linhas em volta que
// não são âncoras pertencem ao movimento mais próximo.
//
// ─── O MONTANTE TEM ESPAÇOS LÁ DENTRO ──────────────────────────────────────
//
// «1 630,57 5 163,71» são DOIS números, não quatro. O separador de milhares é
// um espaço, igual ao que separa as colunas. Uma expressão que apanhasse
// «qualquer coisa com dígitos» lia 1 e 630,57 como valores diferentes.
//
// Por isso os dois valores são lidos com uma forma exacta —
// `\d{1,3}( \d{3})*,\d{2}` — e ancorados ao `EUR` do fim da linha.

import type { LeituraCrua, Movimento } from '../tipos';
import { valorDeExtrato, dataDiaMesAno, fimDoIban } from '../numeros';

// ─── O SEPARADOR DE MILHARES NÃO É UM ESPAÇO ────────────────────────────────
//
// É um espaço SEM QUEBRA (U+00A0). No ecrã são indistinguíveis; numa expressão
// regular não: `(?: \d{3})` com um espaço normal não casa com «3 533,14», e o
// leitor devolvia zero movimentos num extrato perfeitamente legível.
//
// Foi exactamente o que aconteceu à primeira. O byte diz C2 A0 e o olho diz
// espaço — é o género de engano que não se vê a olhar para o texto.
const ESPACOS = String.raw`[\s\u00a0\u202f\u2009]`;

/** Um valor em euros como o ABANCA o escreve: vírgula decimal, espaço nos milhares. */
const VALOR = String.raw`-?\d{1,3}(?:${ESPACOS}\d{3})*,\d{2}`;

// A DESCRIÇÃO É OPCIONAL na linha âncora, e isto não é um detalhe: há
// movimentos em que a coluna da descrição fica toda nas linhas de cima e de
// baixo, e a âncora é só três datas e dois valores. Com a descrição
// obrigatória, o leitor saltava essas linhas — e saltou: perdeu a comissão do
// TPA de 5,00 €, o que partiu a cadeia de saldos. Foi a cadeia que o apanhou.
const ANCORA = new RegExp(
  String.raw`^(\d{2}/\d{2}/\d{4})${ESPACOS}+(\d{2}/\d{2}/\d{4})${ESPACOS}+(\d{2}/\d{2}/\d{4})${ESPACOS}+`
  + String.raw`(?:(.*?)${ESPACOS}+)?(${VALOR})${ESPACOS}+(${VALOR})${ESPACOS}+EUR${ESPACOS}*$`,
);

/** Uma referência do banco: um número comprido no meio da descrição. */
const REFERENCIA = /\b(\d{8,})\b|\b(PT\d{6,})\b/;

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim();

export function ehAbanca(texto: string): boolean {
  return /MOVIMENTOS_PT\d/.test(texto)
    || /\bABANCA\b/i.test(texto)
    || /^PT50017033/m.test(texto.replace(/\s/g, ''));
}

export function lerAbanca(texto: string): LeituraCrua {
  const linhas = texto.split('\n');
  const avisos: string[] = [];

  const contaTerminadaEm = fimDoIban(texto);

  // «PERÍODO: 2026-08-01 - 2026-08-31» do bloco de filtros.
  const periodoBruto = /PER[ÍI]ODO:\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/i.exec(texto);
  const periodo = {
    de: periodoBruto?.[1] ?? null,
    ate: periodoBruto?.[2] ?? null,
  };

  // A folha de posições NÃO é um extrato de movimentos. Reconhece-se e
  // diz-se qual é a exportação certa — é a diferença entre a pessoa corrigir
  // em dez segundos e passar meia hora a desconfiar do importador.
  const ehFolhaDePosicoes = /EXTRATO\s+INTEGRADO/i.test(texto) && !ANCORA.test(linhas.join('\n'));

  // ─── DUAS FASES, E NÃO UMA ──────────────────────────────────────────────
  //
  // Primeiro marcam-se as âncoras e guardam-se as linhas soltas com a posição
  // onde apareceram. Só depois se reparte: as soltas ANTES de uma âncora são
  // dela, e a PRIMEIRA solta depois dela também — é o resto da coluna «TIPO
  // OPERAÇÃO», que o ABANCA parte em duas linhas, uma de cada lado.
  //
  // ─── PORQUE É QUE UMA DESCRIÇÃO TROCADA NÃO É GRAVE ────────────────────
  //
  // Porque esta repartição é um palpite sobre uma coluna estreita, e um
  // palpite erra. O que ele NÃO pode estragar é o dinheiro: as datas e os
  // dois valores vêm todos da linha âncora, e a cadeia de saldos confere-os
  // um a um. Uma descrição mal colada é feia; um valor errado é impossível.
  const marcas: { ancora: RegExpExecArray | null; texto: string }[] = [];

  for (const linha of linhas) {
    const m = ANCORA.exec(linha.trim());
    if (m) { marcas.push({ ancora: m, texto: m[4] ?? '' }); continue; }

    const t = limpar(linha);
    // O cabeçalho e o rodapé não são descrição de nada.
    if (t && !/^(D\.|PER[ÍI]ODO|TIPO OPERA|Filtros|PT\d|\d{2}\/\d{2}\/\d{2},)/i.test(t)
        && !/^(DESCRI|REFER|MONTANTE|SALDO|MOEDA|CONTABIL|OPERA)/i.test(t)) {
      marcas.push({ ancora: null, texto: t });
    }
  }

  const movimentos: Movimento[] = [];

  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i].ancora;
    if (!m) continue;

    const valor = valorDeExtrato(m[5]);
    const saldo = valorDeExtrato(m[6]);
    if (valor === null) continue;

    // Para trás: tudo o que estava solto desde a âncora anterior.
    const antes: string[] = [];
    for (let j = i - 1; j >= 0 && !marcas[j].ancora; j--) antes.unshift(marcas[j].texto);

    // Para a frente: SÓ a primeira. A segunda já é da âncora seguinte.
    const depois = marcas[i + 1] && !marcas[i + 1].ancora ? [marcas[i + 1].texto] : [];

    const tudo = limpar([...antes, m[4] ?? '', ...depois].join(' '));
    const ref = REFERENCIA.exec(tudo);

    movimentos.push({
      // A primeira coluna é a data VALOR — é o que o cabeçalho diz, e é a que
      // manda para saber em que mês a despesa entra.
      data: dataDiaMesAno(m[1]) ?? dataDiaMesAno(m[2]) ?? '',
      dataLancamento: dataDiaMesAno(m[2]),
      descricao: limpar(tudo.replace(REFERENCIA, '')) || tudo,
      valor,
      saldo,
      referencia: ref ? (ref[1] ?? ref[2] ?? null) : null,
    });
  }

  // As linhas soltas que sobram no fim são o rodapé, e não interessam.

  if (ehFolhaDePosicoes) {
    avisos.push(
      'Este ficheiro é a folha de posições do ABANCA (saldos e cartões), não o extrato de movimentos. '
      + 'No homebanking, exporte os MOVIMENTOS da conta — o ficheiro começa por «MOVIMENTOS_PT50…».',
    );
  }

  // ─── O SALDO INICIAL É DEDUZIDO, E NÃO LIDO ─────────────────────────────
  //
  // O ABANCA não imprime o saldo anterior. Mas imprime o saldo DEPOIS do
  // primeiro movimento, e o valor desse movimento — e a diferença entre os
  // dois é o saldo inicial, exactamente. Sem isto, o primeiro elo da cadeia
  // ficava sem nada com que ser comparado e a verificação começava na segunda
  // linha.
  const primeiro = movimentos[0];
  const saldoInicial = primeiro && primeiro.saldo !== null
    ? Math.round((primeiro.saldo - primeiro.valor) * 100) / 100
    : null;

  return {
    banco: 'ABANCA',
    contaTerminadaEm,
    periodo,
    movimentos,
    saldoInicial,
    // O ABANCA também não declara um saldo final à parte. Fica nulo: declarar
    // o último saldo lido como «declarado» era conferir uma coisa contra ela
    // mesma, e isso passa sempre.
    saldoFinal: null,
    avisos,
    // O ABANCA escreve o montante COM sinal numa coluna só, por isso não há
    // sinal a deduzir: a cadeia de saldos confere-o de verdade.
    recusa: null,
  };
}
