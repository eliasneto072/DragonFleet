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

// ─── TABELAS DE MOVIMENTOS: Prio e Via Verde ─────────────────────────────────
//
// As tabelas acima são de GANHOS: um nome e um valor por linha. As da Prio e da
// Via Verde são de MOVIMENTOS — data, matrícula, valor — e têm duas coisas que
// as de ganhos não têm:
//
//   1. Células com DUAS LINHAS. A data da Prio é "23/09/2026" por cima de
//      "14:02"; o cartão é o número por cima da matrícula.
//   2. Colunas que são ÍCONES. O estado da Via Verde é um X ou um relógio.
//
// Daí um leitor próprio. Continua a não haver seletores CSS: a tabela é
// encontrada pelo texto dos cabeçalhos, como nas outras.

/**
 * O texto de uma célula, com as quebras de linha PRESERVADAS.
 *
 * `textContent` cola o que o portal desenha em blocos separados: a data
 * "23/09/2026" por cima de "14:02" chegava como "23/09/202614:02", e do outro
 * lado já não há forma de a separar. `innerText` segue a disposição que o
 * browser desenhou e põe um "\n" entre as duas. O servidor sabe ler isso.
 */
function textoCelula(el) {
  if (!el) return '';
  const bruto = typeof el.innerText === 'string' ? el.innerText : (el.textContent ?? '');
  return bruto
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * O que um ícone quer dizer, lido do que o descreve.
 *
 * Por ordem de confiança: os atributos que existem para isto (title,
 * aria-label, alt, o <title> de um SVG); depois um glifo sozinho ("✕");
 * por último o nome das classes, que é uma aposta.
 *
 * Devolve null quando não encontra nada. É melhor do que adivinhar: o
 * servidor trata "sem estado" como "não cancelado", e a linha aparece na
 * pré-visualização para alguém ver.
 */
function descreverIcone(el) {
  if (!el) return null;
  const nos = [el, ...el.querySelectorAll('*')];

  const ditos = [];
  for (const n of nos) {
    for (const a of ['title', 'aria-label', 'alt', 'data-original-title', 'data-tooltip', 'data-title']) {
      const v = n.getAttribute?.(a);
      if (v && v.trim()) ditos.push(v.trim());
    }
    if (n.tagName && n.tagName.toLowerCase() === 'title' && n.textContent.trim()) {
      ditos.push(n.textContent.trim());
    }
  }
  if (ditos.length) return [...new Set(ditos)].join(' · ');

  const t = textoCelula(el);
  if (/^[×✕✖✗xX]$/.test(t)) return 'Cancelado';
  if (/^[✓✔]$/.test(t)) return 'Pago';

  const classes = nos.map((n) => n.getAttribute?.('class') ?? '').join(' ').toLowerCase();
  if (/cancel|anulad|\bicon-close\b|\bfa-times\b|\bfa-xmark\b|\bx-mark\b/.test(classes)) return 'Cancelado (pelo ícone)';
  if (/clock|pending|pendente|hourglass|\bfa-clock\b/.test(classes)) return 'Pendente (pelo ícone)';
  if (/\bcheck\b|success|\bpaid\b|\bpago\b|fa-check/.test(classes)) return 'Pago (pelo ícone)';

  return t || null;
}

/**
 * Encontra a grelha cujos cabeçalhos contêm todos os textos pedidos, e devolve
 * os cabeçalhos e as linhas como listas de células.
 *
 * Três formas, porque os portais usam as três:
 *   - <table> com cabeçalho e corpo na mesma tabela;
 *   - <table> de cabeçalho separada da <table> do corpo (cabeçalho fixo);
 *   - grelha ARIA: role="table"/"grid", role="row", role="cell".
 */
function encontrarGrelha(cabecalhosProcurados) {
  const procurados = cabecalhosProcurados.map(normalizar);
  const temTodos = (cabs) => procurados.every((p) => cabs.some((c) => c === p || c.startsWith(p)));

  for (const tabela of document.querySelectorAll('table')) {
    const linhaCab = tabela.querySelector('thead tr')
      ?? [...tabela.querySelectorAll('tr')].find((tr) => tr.querySelector('th'));
    if (!linhaCab) continue;

    const cabecalhos = [...linhaCab.children].map((c) => normalizar(texto(c)));
    if (!temTodos(cabecalhos)) continue;

    let linhas = [...tabela.querySelectorAll('tr')]
      .filter((tr) => tr !== linhaCab && !tr.closest('thead') && !tr.closest('tfoot'))
      .map((tr) => [...tr.children]);

    // Cabeçalho fixo: a tabela do cabeçalho não tem corpo. O corpo é a tabela
    // seguinte com o mesmo número de colunas.
    if (linhas.filter((l) => l.length > 1).length === 0) {
      const todas = [...document.querySelectorAll('table')];
      for (const outra of todas.slice(todas.indexOf(tabela) + 1)) {
        const candidatas = [...outra.querySelectorAll('tr')].map((tr) => [...tr.children]);
        if (candidatas.some((l) => l.length === cabecalhos.length)) {
          linhas = candidatas;
          break;
        }
      }
    }
    return { cabecalhos, linhas };
  }

  for (const grelha of document.querySelectorAll('[role="table"], [role="grid"], [role="treegrid"]')) {
    const cabecalhos = [...grelha.querySelectorAll('[role="columnheader"]')].map((c) => normalizar(texto(c)));
    if (!temTodos(cabecalhos)) continue;

    const linhas = [...grelha.querySelectorAll('[role="row"]')]
      .filter((r) => !r.querySelector('[role="columnheader"]'))
      .map((r) => [...r.querySelectorAll('[role="cell"], [role="gridcell"]')]);
    return { cabecalhos, linhas };
  }

  return null;
}

/**
 * Lê as linhas de uma grelha, campo a campo, pelo nome da coluna.
 *
 * `mapa` é { campo: 'cabecalho' }. Devolve, por linha, o ELEMENTO de cada
 * célula e não o texto: cada portal decide como ler cada célula — umas pelo
 * texto, outras pelo ícone.
 *
 * Linhas vazias e de TOTAL ficam de fora. Linhas com menos células do que as
 * colunas pedidas também, porque costumam ser separadores ou detalhes
 * expandidos, e ler posições nelas daria valores trocados.
 */
function lerGrelha(obrigatorios, mapa) {
  const grelha = encontrarGrelha(obrigatorios);
  if (!grelha) return null;

  const indices = {};
  for (const [campo, procurado] of Object.entries(mapa)) {
    const alvo = normalizar(procurado);
    indices[campo] = grelha.cabecalhos.findIndex((c) => c === alvo || c.startsWith(alvo));
  }
  const maiorIndice = Math.max(...Object.values(indices).filter((i) => i >= 0));

  const linhas = [];
  for (const celulas of grelha.linhas) {
    if (celulas.length <= maiorIndice) continue;
    const primeira = normalizar(texto(celulas[0]));
    if (!primeira && celulas.every((c) => !texto(c))) continue;
    if (primeira.startsWith('total')) continue;

    const linha = {};
    for (const [campo, i] of Object.entries(indices)) linha[campo] = i >= 0 ? celulas[i] : null;
    linhas.push(linha);
  }

  return { linhas, colunasEmFalta: Object.keys(indices).filter((k) => indices[k] < 0) };
}

/**
 * Só a quantia de uma célula de valor.
 *
 * A célula do TOTAL da Prio tem um ícone de informação antes do número, e a do
 * valor da Via Verde tem um ícone depois. Fica a última coisa que parece uma
 * quantia — de preferência uma com casas decimais.
 */
function quantiaDe(t) {
  const achadas = String(t ?? '').match(/-?\d[\d.,\s]*\d\s*€?|-?\d\s*€?/g) ?? [];
  const decimais = achadas.filter((a) => /[.,]\d{1,4}/.test(a));
  const escolhida = (decimais.length ? decimais : achadas).pop();
  return escolhida ? escolhida.replace(/\s+/g, '') : null;
}

const extrator = {
  encontrarTabela, lerLinhasDeTable, lerLinhasDeDivs, texto, normalizar,
  textoCelula, descreverIcone, encontrarGrelha, lerGrelha, quantiaDe,
};
