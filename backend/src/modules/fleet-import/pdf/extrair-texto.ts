// src/modules/fleet-import/pdf/extrair-texto.ts
//
// De PDF para linhas de texto, sem bibliotecas.
//
// ─── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
//
// Os leitores da Via Verde e da Prio trabalham sobre TEXTO, linha a linha. Os
// portais só dão PDF. Falta esta peça no meio, e normalmente instala-se uma
// biblioteca para isso.
//
// Só usa `zlib`, que vem no Node. Sem dependência nova, sem `package-lock`
// para sincronizar, sem mais uma biblioteca a precisar de atualizações de
// segurança num servidor que corre sozinho.
//
// ─── O QUE UM PDF TEM LÁ DENTRO ─────────────────────────────────────────────
//
// Um PDF não guarda linhas. Guarda instruções de desenho: "põe a caneta aqui,
// escreve estes glifos, põe a caneta ali". As linhas são uma coisa que o olho
// humano vê e que aqui tem de ser reconstruída a partir das coordenadas.
//
// São quatro problemas, e cada um destes ficheiros traz o seu:
//
//   1. COMPRESSÃO — o conteúdo vem em zlib. Fácil.
//
//   2. CODIFICAÇÃO — a Via Verde escreve `(BG-49-GP) Tj`, que se lê de
//      imediato. A Prio escreve `<002400420015> Tj`: são índices de glifos
//      dentro de uma fonte recortada, e o `0x0024` de um ficheiro não é a
//      mesma letra que o `0x0024` do ficheiro seguinte. A tradução está numa
//      tabela `/ToUnicode` dentro do próprio PDF, e é preciso lê-la.
//
//   3. POSIÇÃO — `Tm`, `Td`, `T*` e `cm` mexem na caneta, e compõem-se por
//      multiplicação de matrizes. A Prio ainda desenha com o eixo Y invertido
//      e escalado a 0,24. Sem fazer esta conta, as linhas saem pela ordem
//      errada, ou nem se agrupam.
//
//   4. ESPAÇOS — e este é o que fazia mal em silêncio. O PDF parte as palavras
//      em pedaços para ajustar o espaçamento entre letras, e ficam pedaços
//      colados sem espaço entre eles. Decidir "isto é um espaço" pela distância
//      em bruto dava `BT -63-NU`: a matrícula partida ao meio, invisível para
//      a expressão que a procura, e a despesa daquele carro a cair no monte do
//      "por atribuir" todas as semanas.
//
//      A solução é a única correta: saber a LARGURA de cada glifo, que também
//      está no PDF (`/W` nas fontes recortadas, `/Widths` nas normais). Com
//      ela sabe-se onde um pedaço acaba, e só há espaço quando o pedaço
//      seguinte começa claramente mais à frente.
//
// ─── O QUE ESTE EXTRATOR NÃO FAZ ────────────────────────────────────────────
//
// Não lê PDFs encriptados, não lê tabelas de objetos comprimidas (`ObjStm`),
// não lê texto que seja imagem. Nenhum dos três portais usa nada disto — e se
// um dia usarem, o extrator devolve pouco ou nada e a CONFERÊNCIA DOS LEITORES
// recusa a importação. É isso que torna esta peça segura de ter: ela não
// precisa de estar sempre certa, precisa de nunca estar errada em silêncio.

import { inflateSync, inflateRawSync } from 'node:zlib';

// ─────────────────────────────────────────────────────────────────────────────
// Objetos e streams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `12 0 obj … endobj` → mapa 12 → corpo.
 *
 * latin-1 de propósito: um byte dá exatamente um caractere, por isso as
 * posições na string são as posições no ficheiro e os bytes do stream
 * sobrevivem intactos à ida e à volta.
 */
function objetos(bruto: string): Map<number, string> {
  const mapa = new Map<number, string>();
  const re = /(?<![0-9])(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto)) !== null) {
    const fim = bruto.indexOf('endobj', m.index);
    mapa.set(Number(m[1]), bruto.slice(m.index + m[0].length, fim < 0 ? bruto.length : fim));
  }
  return mapa;
}

/** O conteúdo de um stream, já descomprimido, ou null se não der. */
function streamDe(corpo: string): string | null {
  const m = /stream\r?\n/.exec(corpo);
  if (!m) return null;
  const inicio = m.index + m[0].length;
  const fim = corpo.lastIndexOf('endstream');
  if (fim < inicio) return null;
  const dados = Buffer.from(corpo.slice(inicio, fim), 'latin1');
  if (!corpo.slice(0, m.index).includes('/FlateDecode')) return dados.toString('latin1');
  for (const descomprimir of [inflateSync, inflateRawSync]) {
    try {
      return descomprimir(dados).toString('latin1');
    } catch {
      // Tenta a seguinte. Um stream que não abre é um stream que se ignora:
      // as fontes embutidas também são streams e não interessam a ninguém.
    }
  }
  return null;
}

/** O número do objeto em `/Chave 12 0 R`. */
function referencia(corpo: string, chave: string): number | null {
  const m = new RegExp(`/${chave}\\s+(\\d+)\\s+\\d+\\s+R`).exec(corpo);
  return m ? Number(m[1]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fontes: traduzir códigos de glifo para letras
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tabela `/ToUnicode`: código do glifo → letra.
 *
 * Vem em dois formatos, e um PDF usa os dois:
 *   `<0003> <0020>`                um código, uma letra
 *   `<000F> <001E> <002C>`         uma gama de códigos a partir de uma letra
 */
function cmapParaUnicode(texto: string): Map<number, string> {
  const tabela = new Map<number, string>();

  for (const bloco of texto.match(/beginbfchar[\s\S]*?endbfchar/g) ?? []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloco)) !== null) {
      let letra = '';
      for (let i = 0; i + 3 < m[2].length + 3 && i < m[2].length; i += 4) {
        letra += String.fromCharCode(parseInt(m[2].slice(i, i + 4).padEnd(4, '0'), 16));
      }
      tabela.set(parseInt(m[1], 16), letra);
    }
  }

  for (const bloco of texto.match(/beginbfrange[\s\S]*?endbfrange/g) ?? []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloco)) !== null) {
      const inicio = parseInt(m[1], 16);
      const fim = parseInt(m[2], 16);
      const destino = parseInt(m[3], 16);
      // Um limite de sanidade: um PDF mal formado podia declarar uma gama de
      // milhões de códigos e deixar o servidor a encher memória.
      for (let c = inicio; c <= fim && c - inicio < 65536; c += 1) {
        tabela.set(c, String.fromCharCode(destino + (c - inicio)));
      }
    }
  }

  return tabela;
}

/**
 * `/W [0 [750 0 0 277] 11 12 333 …]` → largura por código, em milésimos.
 *
 * Dois formatos alternados na mesma lista: `código [larguras…]` e
 * `códigoInicial códigoFinal largura`.
 */
function largurasCid(corpo: string): Map<number, number> {
  const larguras = new Map<number, number>();
  const abre = /\/W\s*\[/.exec(corpo);
  if (!abre) return larguras;

  let i = abre.index + abre[0].length;
  let profundidade = 1;
  while (i < corpo.length && profundidade > 0) {
    if (corpo[i] === '[') profundidade += 1;
    else if (corpo[i] === ']') profundidade -= 1;
    i += 1;
  }

  // A lista fica uma fila de dois tipos de item: números soltos e grupos.
  const fila: Array<{ grupo: number[] } | { numero: number }> = [];
  const re = /\[([^\]]*)\]|([-+]?[\d.]+)/g;
  let m: RegExpExecArray | null;
  const dentro = corpo.slice(abre.index + abre[0].length, i - 1);
  while ((m = re.exec(dentro)) !== null) {
    if (m[1] !== undefined) {
      fila.push({ grupo: m[1].trim().split(/\s+/).filter(Boolean).map(Number) });
    } else {
      fila.push({ numero: Number(m[2]) });
    }
  }

  for (let k = 0; k < fila.length; ) {
    const atual = fila[k];
    if (!('numero' in atual)) { k += 1; continue; }
    const codigo = Math.round(atual.numero);
    const seguinte = fila[k + 1];
    if (seguinte && 'grupo' in seguinte) {
      seguinte.grupo.forEach((w, j) => larguras.set(codigo + j, w));
      k += 2;
      continue;
    }
    const terceiro = fila[k + 2];
    if (seguinte && 'numero' in seguinte && terceiro && 'numero' in terceiro) {
      const fim = Math.round(seguinte.numero);
      for (let c = codigo; c <= fim && c - codigo < 65536; c += 1) larguras.set(c, terceiro.numero);
      k += 3;
      continue;
    }
    k += 1;
  }

  return larguras;
}

/** `/FirstChar 32 /Widths [277 0 …]` — o formato das fontes não recortadas. */
function largurasSimples(corpo: string): Map<number, number> {
  const larguras = new Map<number, number>();
  const w = /\/Widths\s*\[([^\]]*)\]/.exec(corpo);
  const primeiro = /\/FirstChar\s+(\d+)/.exec(corpo);
  if (!w || !primeiro) return larguras;
  w[1].trim().split(/\s+/).filter(Boolean)
    .forEach((valor, i) => larguras.set(Number(primeiro[1]) + i, Number(valor)));
  return larguras;
}

interface Fonte {
  /** null quando a fonte não traz tradução: aí os códigos já são letras. */
  paraUnicode: Map<number, string> | null;
  /** 2 nas fontes recortadas (Identity-H), 1 nas normais. */
  bytesPorCodigo: 1 | 2;
  larguras: Map<number, number>;
  larguraPorOmissao: number;
}

function lerFonte(corpo: string, objs: Map<number, string>): Fonte {
  const tu = referencia(corpo, 'ToUnicode');
  const cru = tu !== null ? objs.get(tu) : undefined;
  const conteudo = cru ? streamDe(cru) : null;

  let larguras = largurasSimples(corpo);
  let larguraPorOmissao = 500;

  // Nas fontes recortadas as larguras estão no descendente, não aqui.
  const descendente = /\/DescendantFonts\s*\[?\s*(\d+)\s+\d+\s+R/.exec(corpo);
  if (descendente) {
    const filho = objs.get(Number(descendente[1]));
    if (filho) {
      const doFilho = largurasCid(filho);
      if (doFilho.size > 0) larguras = doFilho;
      const dw = /\/DW\s+([\d.]+)/.exec(filho);
      if (dw && Number(dw[1]) > 0) larguraPorOmissao = Number(dw[1]);
    }
  }

  return {
    paraUnicode: conteudo ? cmapParaUnicode(conteudo) : null,
    bytesPorCodigo: corpo.includes('/Identity-H') ? 2 : 1,
    larguras,
    larguraPorOmissao,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Páginas
// ─────────────────────────────────────────────────────────────────────────────

interface Pagina {
  conteudo: string;
  fontes: Map<string, Fonte>;
}

function paginas(objs: Map<number, string>): Pagina[] {
  const encontradas: Pagina[] = [];

  // Pela ordem do número do objeto, que nestes ficheiros é a ordem das
  // páginas. Seguir a árvore `/Kids` seria mais correto em geral; aqui não
  // muda nada, e cada página é conferida pelo seu próprio conteúdo.
  for (const numero of [...objs.keys()].sort((a, b) => a - b)) {
    const corpo = objs.get(numero) as string;
    const inicioStream = corpo.indexOf('stream');
    const cabecalho = inicioStream >= 0 ? corpo.slice(0, inicioStream) : corpo;
    if (!/\/Type\s*\/Page(?![s])/.test(cabecalho)) continue;

    const refConteudo = referencia(cabecalho, 'Contents');
    const bruto = refConteudo !== null ? objs.get(refConteudo) : undefined;
    const conteudo = bruto ? streamDe(bruto) : null;
    if (!conteudo) continue;

    const refRecursos = referencia(cabecalho, 'Resources');
    const recursos = (refRecursos !== null ? objs.get(refRecursos) : undefined) ?? cabecalho;

    const fontes = new Map<string, Fonte>();
    const bloco = /\/Font\s*<<([\s\S]*?)>>/.exec(recursos);
    if (bloco) {
      const re = /\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bloco[1])) !== null) {
        const corpoFonte = objs.get(Number(m[2]));
        if (corpoFonte) fontes.set(m[1], lerFonte(corpoFonte, objs));
      }
    }

    encontradas.push({ conteudo, fontes });
  }

  return encontradas;
}

// ─────────────────────────────────────────────────────────────────────────────
// O conteúdo da página: instruções de desenho
// ─────────────────────────────────────────────────────────────────────────────

type Token =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'nome'; valor: string }
  | { tipo: 'texto'; valor: number[] }   // bytes já sem escapes
  | { tipo: 'operador'; valor: string };

const ESPACO = ' \t\r\n\f\0';
const DELIMITADOR = '()<>[]{}/%';
const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };

/**
 * Parte o content stream em tokens.
 *
 * Um varredor e não uma expressão regular gigante: as strings de um PDF podem
 * ter parênteses aninhados e escapes em octal, e isso não se apanha com uma
 * expressão sem ficar a adivinhar.
 */
function* tokens(d: string): Generator<Token> {
  let i = 0;
  while (i < d.length) {
    const c = d[i];

    if (ESPACO.includes(c)) { i += 1; continue; }

    if (c === '%') {
      while (i < d.length && d[i] !== '\r' && d[i] !== '\n') i += 1;
      continue;
    }

    if (c === '(') {
      i += 1;
      let profundidade = 1;
      const bytes: number[] = [];
      while (i < d.length && profundidade > 0) {
        const ch = d[i];
        if (ch === '\\') {
          const nx = d[i + 1] ?? '';
          if (ESCAPES[nx] !== undefined) { bytes.push(ESCAPES[nx].charCodeAt(0)); i += 2; continue; }
          if (nx >= '0' && nx <= '7') {
            let octal = '';
            i += 1;
            while (octal.length < 3 && d[i] >= '0' && d[i] <= '7') { octal += d[i]; i += 1; }
            bytes.push(parseInt(octal, 8) & 0xff);
            continue;
          }
          if (nx === '\r' || nx === '\n') { i += 2; continue; }  // continuação de linha
          bytes.push(nx.charCodeAt(0)); i += 2; continue;
        }
        if (ch === '(') profundidade += 1;
        else if (ch === ')') {
          profundidade -= 1;
          if (profundidade === 0) { i += 1; break; }
        }
        bytes.push(ch.charCodeAt(0) & 0xff);
        i += 1;
      }
      yield { tipo: 'texto', valor: bytes };
      continue;
    }

    if (c === '<' && d[i + 1] !== '<') {
      const fim = d.indexOf('>', i);
      const hex = d.slice(i + 1, fim < 0 ? d.length : fim).replace(/\s+/g, '');
      const bytes: number[] = [];
      for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16));
      yield { tipo: 'texto', valor: bytes };
      i = fim < 0 ? d.length : fim + 1;
      continue;
    }

    if (d.startsWith('<<', i)) { yield { tipo: 'operador', valor: '<<' }; i += 2; continue; }
    if (d.startsWith('>>', i)) { yield { tipo: 'operador', valor: '>>' }; i += 2; continue; }

    if (c === '/') {
      let j = i + 1;
      while (j < d.length && !ESPACO.includes(d[j]) && !DELIMITADOR.includes(d[j])) j += 1;
      yield { tipo: 'nome', valor: d.slice(i + 1, j) };
      i = j;
      continue;
    }

    if ('[]{}'.includes(c)) { yield { tipo: 'operador', valor: c }; i += 1; continue; }

    let j = i;
    while (j < d.length && !ESPACO.includes(d[j]) && !DELIMITADOR.includes(d[j])) j += 1;
    const palavra = d.slice(i, j);
    i = j === i ? i + 1 : j;
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(palavra)) yield { tipo: 'numero', valor: Number(palavra) };
    else if (palavra) yield { tipo: 'operador', valor: palavra };
  }
}

type Matriz = [number, number, number, number, number, number];

/** Produto de duas matrizes de transformação. */
function multiplicar(a: Matriz, b: Matriz): Matriz {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

interface Peca {
  y: number;
  x: number;
  /** Onde este pedaço ACABA. É isto que decide se há espaço até ao seguinte. */
  fim: number;
  texto: string;
  tamanho: number;
}

function extrairPagina(pagina: Pagina): Peca[] {
  const pecas: Peca[] = [];

  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  const pilha: Matriz[] = [];
  let tm: Matriz = [1, 0, 0, 1, 0, 0];
  let tlm: Matriz = [1, 0, 0, 1, 0, 0];
  let entrelinha = 0;
  let fonte: Fonte | undefined;
  let tamanho = 1;
  let espacoCaractere = 0;
  let espacoPalavra = 0;
  let escalaH = 100;
  let argumentos: Token[] = [];

  const escrever = (bytes: number[]) => {
    const codigos: number[] = [];
    if (fonte?.bytesPorCodigo === 2) {
      for (let k = 0; k + 1 < bytes.length; k += 2) codigos.push((bytes[k] << 8) | bytes[k + 1]);
    } else {
      codigos.push(...bytes);
    }

    let texto = '';
    for (const codigo of codigos) {
      if (fonte?.paraUnicode) texto += fonte.paraUnicode.get(codigo) ?? '';
      else texto += String.fromCharCode(codigo);
    }

    // O avanço da caneta, em unidades de texto.
    let milesimos = 0;
    for (const codigo of codigos) {
      milesimos += fonte?.larguras.get(codigo) ?? fonte?.larguraPorOmissao ?? 500;
    }
    const avanco =
      (milesimos / 1000 * tamanho
        + espacoCaractere * codigos.length
        + espacoPalavra * codigos.filter((c) => c === 32).length)
      * (escalaH / 100);

    if (texto.trim() !== '') {
      const m = multiplicar(tm, ctm);
      const escala =
        Math.hypot(ctm[0], ctm[1]) * Math.hypot(tm[0], tm[1]);
      pecas.push({
        y: m[5],
        x: m[4],
        fim: m[4] + avanco * escala,
        texto,
        tamanho: tamanho * escala,
      });
    }

    tm = multiplicar([1, 0, 0, 1, avanco, 0], tm);
  };

  for (const token of tokens(pagina.conteudo)) {
    if (token.tipo !== 'operador' || token.valor === '<<' || token.valor === '>>'
        || token.valor === '[' || token.valor === ']') {
      // Os operandos empilham-se até aparecer o operador que os consome.
      if (token.tipo !== 'operador') argumentos.push(token);
      continue;
    }

    const op = token.valor;
    const numeros = argumentos.filter((a) => a.tipo === 'numero') as Array<{ tipo: 'numero'; valor: number }>;
    const seisUltimos = (): Matriz | null =>
      numeros.length >= 6 ? (numeros.slice(-6).map((n) => n.valor) as Matriz) : null;

    if (op === 'q') {
      pilha.push([...ctm] as Matriz);
    } else if (op === 'Q') {
      const anterior = pilha.pop();
      if (anterior) ctm = anterior;
    } else if (op === 'cm') {
      const m = seisUltimos();
      if (m) ctm = multiplicar(m, ctm);
    } else if (op === 'BT') {
      tm = [1, 0, 0, 1, 0, 0];
      tlm = [1, 0, 0, 1, 0, 0];
    } else if (op === 'Tf') {
      const nome = [...argumentos].reverse().find((a) => a.tipo === 'nome');
      if (nome && nome.tipo === 'nome') fonte = pagina.fontes.get(nome.valor);
      if (numeros.length > 0) tamanho = numeros[numeros.length - 1].valor;
    } else if (op === 'Tc' && numeros.length > 0) {
      espacoCaractere = numeros[numeros.length - 1].valor;
    } else if (op === 'Tw' && numeros.length > 0) {
      espacoPalavra = numeros[numeros.length - 1].valor;
    } else if (op === 'Tz' && numeros.length > 0) {
      escalaH = numeros[numeros.length - 1].valor;
    } else if (op === 'TL' && numeros.length > 0) {
      entrelinha = numeros[numeros.length - 1].valor;
    } else if (op === 'Tm') {
      const m = seisUltimos();
      if (m) { tm = m; tlm = [...m] as Matriz; }
    } else if ((op === 'Td' || op === 'TD') && numeros.length >= 2) {
      const dx = numeros[numeros.length - 2].valor;
      const dy = numeros[numeros.length - 1].valor;
      if (op === 'TD') entrelinha = -dy;
      tlm = multiplicar([1, 0, 0, 1, dx, dy], tlm);
      tm = [...tlm] as Matriz;
    } else if (op === 'T*') {
      tlm = multiplicar([1, 0, 0, 1, 0, -entrelinha], tlm);
      tm = [...tlm] as Matriz;
    } else if (op === 'Tj' || op === "'" || op === '"') {
      if (op !== 'Tj') {
        tlm = multiplicar([1, 0, 0, 1, 0, -entrelinha], tlm);
        tm = [...tlm] as Matriz;
      }
      const ultimo = [...argumentos].reverse().find((a) => a.tipo === 'texto');
      if (ultimo && ultimo.tipo === 'texto') escrever(ultimo.valor);
    } else if (op === 'TJ') {
      // `[(A) -20 (B)] TJ` — os números são ajustes de espaçamento que o
      // avanço calculado já cobre com folga suficiente para o que interessa.
      for (const a of argumentos) if (a.tipo === 'texto') escrever(a.valor);
    }

    argumentos = [];
  }

  return pecas;
}

// ─────────────────────────────────────────────────────────────────────────────
// De pedaços espalhados para linhas
// ─────────────────────────────────────────────────────────────────────────────

/** Meio ponto de tolerância: o que está na mesma linha raramente varia mais. */
const TOLERANCIA_Y = 2.5;
/** Um quinto do corpo da letra. Abaixo disto é a mesma palavra. */
const FRACAO_ESPACO = 0.22;

function juntarEmLinhas(pecas: Peca[]): string[] {
  const ordenadas = [...pecas].sort((a, b) => {
    const dy = Math.round(b.y * 10) - Math.round(a.y * 10);
    return dy !== 0 ? dy : a.x - b.x;
  });

  const grupos: Peca[][] = [];
  let atual: Peca[] = [];
  let referenciaY: number | null = null;
  for (const peca of ordenadas) {
    if (referenciaY === null || Math.abs(peca.y - referenciaY) <= TOLERANCIA_Y) {
      atual.push(peca);
      if (referenciaY === null) referenciaY = peca.y;
    } else {
      grupos.push(atual);
      atual = [peca];
      referenciaY = peca.y;
    }
  }
  if (atual.length > 0) grupos.push(atual);

  const linhas: string[] = [];
  for (const grupo of grupos) {
    grupo.sort((a, b) => a.x - b.x);
    let linha = '';
    let fimAnterior: number | null = null;
    let tamanhoAnterior = 10;
    for (const peca of grupo) {
      if (fimAnterior !== null
          && peca.x - fimAnterior > FRACAO_ESPACO * Math.max(peca.tamanho, tamanhoAnterior, 1)) {
        linha += ' ';
      }
      linha += peca.texto;
      fimAnterior = peca.fim;
      tamanhoAnterior = peca.tamanho;
    }
    const limpa = linha.replace(/[ \t]+/g, ' ').trim();
    if (limpa !== '') linhas.push(limpa);
  }

  return linhas;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * O texto de um PDF, uma linha por linha visual.
 *
 * Nunca atira: devolve string vazia quando não consegue ler nada. Quem chama
 * é um leitor que confere a soma contra o total do fornecedor, e é essa
 * conferência que decide se a importação avança — não esta função.
 */
export function extrairTextoPdf(ficheiro: Buffer): string {
  let bruto: string;
  try {
    bruto = ficheiro.toString('latin1');
  } catch {
    return '';
  }
  if (!bruto.startsWith('%PDF')) return '';

  const objs = objetos(bruto);
  const linhas: string[] = [];
  for (const pagina of paginas(objs)) {
    try {
      linhas.push(...juntarEmLinhas(extrairPagina(pagina)));
    } catch {
      // Uma página estranha não leva as outras atrás. O total é que decide.
    }
  }
  return linhas.join('\n');
}
