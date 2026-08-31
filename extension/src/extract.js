// extension/src/extract.js
//
// Ler a tabela de rendimentos da página, sem depender da estrutura do HTML.
//
// ─── POR QUE NÃO HÁ SELETORES CSS AQUI ───────────────────────────────────────
//
// A tentação é escrever `document.querySelector('#earnings > div:nth-child(3)
// table tbody tr')`. Isso funciona hoje e parte no dia em que a Uber mexer num
// `div` — e mexe, porque o portal dela é reescrito com regularidade. Pior: parte
// em SILÊNCIO, devolvendo zero linhas, e quem clicar no botão vê "nada
// encontrado" sem perceber que o problema é nosso.
//
// Em vez disso, ancoramos no TEXTO VISÍVEL dos cabeçalhos: "Nome do motorista",
// "Rendimentos líquidos", "Driver", "Net earnings". Esse texto é a interface com
// o utilizador do portal — se mudar, a página mudou de verdade para toda a
// gente, e não apenas de arrumação interna.
//
// A partir do cabeçalho encontrado, subimos até à tabela que o contém e lemos
// as linhas por posição de coluna. Nenhum caminho de DOM é escrito à mão.
//
// ─── E SE MESMO ASSIM PARTIR ─────────────────────────────────────────────────
//
// Falha ALTO. Devolve um erro com o que procurou e o que encontrou, para a
// mensagem dizer o que se passa em vez de uma lista vazia. Um extrator que
// devolve zero linhas em silêncio é pior do que um que se recusa a correr.

/**
 * Converte texto monetário europeu num número.
 *
 * Os portais escrevem "1.234,56 €", "744,26 €", "0,00 €" e às vezes "—" para
 * vazio. O travessão NÃO é zero: é ausência de valor, e tratá-lo como zero
 * faria uma coluna em falta parecer uma coluna a zeros.
 */
function parseMoney(texto) {
  if (typeof texto !== 'string') return null;
  const limpo = texto.replace(/\s|€|EUR/gi, '').trim();
  if (!limpo || limpo === '—' || limpo === '-' || limpo === 'N/A') return null;

  // ─── OS DOIS PORTAIS ESCREVEM DIFERENTE, E ISSO CUSTA CEM VEZES ────────────
  //
  // A Uber escreve à portuguesa: "1.412,88 €" — ponto de milhares, vírgula
  // decimal. A Bolt escreve à inglesa: "490.7 €" — ponto DECIMAL.
  //
  // Tratar tudo como português transformava os 490,70 € da Bolt em 4907 €.
  // Passaria despercebido: é um número plausível para uma semana boa, e só
  // apareceria como um fecho absurdamente alto que ninguém saberia explicar.
  //
  // A regra que os distingue: se houver vírgula, ela é o separador decimal e
  // os pontos são de milhares. Se NÃO houver vírgula nenhuma, um ponto só —
  // com uma ou duas casas a seguir — é decimal.
  const temVirgula = limpo.includes(',');

  let normalizado;
  if (temVirgula) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d+\.\d{1,2}$/.test(limpo)) {
    // "490.7" ou "490.75": ponto decimal à inglesa.
    normalizado = limpo;
  } else {
    // "1.412" sem decimais: ponto de milhares.
    normalizado = limpo.replace(/\./g, '');
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Texto de um elemento, com espaços colapsados. */
function texto(el) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Sem acentos e em minúsculas, para os cabeçalhos casarem.
 *
 * O mesmo portal escreve "Rendimentos líquidos" na tabela e "RENDIMENTOS
 * LÍQUIDOS" noutro sítio, e a versão inglesa não tem acentos de todo.
 */
function normalizar(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Encontra a tabela cujos cabeçalhos contêm os textos indicados.
 *
 * Procura em `<table>` primeiro. Se não houver — e não há: os dois portais
 * desenham as tabelas com `div` e `role="table"`, ou nem isso — cai para
 * qualquer contentor onde os cabeçalhos apareçam juntos.
 */
function encontrarTabela(cabecalhosProcurados) {
  const procurados = cabecalhosProcurados.map(normalizar);

  for (const tabela of document.querySelectorAll('table')) {
    const celulas = [...tabela.querySelectorAll('th, thead td')].map((c) => normalizar(texto(c)));
    if (procurados.every((p) => celulas.some((c) => c.includes(p)))) {
      return { tipo: 'table', el: tabela, cabecalhos: celulas };
    }
  }

  // Sem <table>: procura o elemento mais fundo que contenha todos os
  // cabeçalhos. O mais fundo, e não o primeiro, porque o <body> também os
  // contém — e devolver o body não ajudaria ninguém.
  let melhor = null;
  for (const el of document.querySelectorAll('div, section, [role="table"]')) {
    const t = normalizar(texto(el));
    if (procurados.every((p) => t.includes(p))) {
      if (!melhor || el.compareDocumentPosition(melhor) & Node.DOCUMENT_POSITION_CONTAINS) {
        melhor = el;
      }
    }
  }
  return melhor ? { tipo: 'div', el: melhor, cabecalhos: [] } : null;
}

/**
 * Lê as linhas de uma tabela HTML, mapeando colunas por cabeçalho.
 */
function lerLinhasDeTable(tabela, cabecalhos, mapa) {
  const indices = {};
  for (const [campo, procurado] of Object.entries(mapa)) {
    const alvo = normalizar(procurado);
    // `startsWith` e não `includes`: "Rendimentos totais" e "Rendimentos
    // líquidos" partilham o prefixo, e um `includes` de "rendimentos" apanharia
    // a coluna errada — que é exatamente o bug que já apanhámos no leitor de CSV.
    indices[campo] = cabecalhos.findIndex((c) => c === alvo || c.startsWith(alvo));
  }

  const linhas = [];
  for (const tr of tabela.querySelectorAll('tbody tr')) {
    const celulas = [...tr.querySelectorAll('td')].map(texto);
    if (celulas.length === 0) continue;

    const linha = {};
    for (const [campo, i] of Object.entries(indices)) {
      linha[campo] = i >= 0 ? celulas[i] : null;
    }
    if (linha.nome) linhas.push(linha);
  }
  return linhas;
}

/**
 * Lê linhas de uma lista desenhada com `div`.
 *
 * Estratégia diferente e mais tolerante: procura elementos que contenham um
 * NOME (duas ou mais palavras com letra maiúscula) e pelo menos um valor
 * monetário. É menos preciso do que uma tabela e serve de rede quando o portal
 * não usa `<table>` — que é o caso do painel da Uber.
 */
function lerLinhasDeDivs(raiz) {
  const linhas = [];
  const vistos = new Set();

  for (const el of raiz.querySelectorAll('*')) {
    // Só folhas com pouco texto: um contentor grande contém tudo e daria uma
    // linha gigante com a página inteira lá dentro.
    if (el.children.length > 6) continue;

    const t = texto(el);
    if (t.length < 5 || t.length > 200) continue;

    const valores = [...t.matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map((m) => m[1]);
    if (valores.length === 0) continue;

    // O nome é o que sobra antes do primeiro valor.
    const antes = t.slice(0, t.indexOf(valores[0])).trim();
    const nome = antes.replace(/^[A-Z]{2}\s+/, '').trim(); // tira iniciais tipo "DJ "
    if (nome.split(/\s+/).length < 2) continue;

    const chave = `${nome}|${valores.join('|')}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    linhas.push({ nome, valores });
  }
  return linhas;
}

const extrator = { encontrarTabela, lerLinhasDeTable, lerLinhasDeDivs, texto, normalizar };
