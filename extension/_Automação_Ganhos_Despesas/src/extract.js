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
/**
 * Uma grelha ARIA: `role="grid"` com `columnheader` e `gridcell`.
 *
 * ─── PORQUE É QUE ISTO VEM PRIMEIRO ────────────────────────────────────────
 *
 * A Uber não usa `<table>` nem divs soltos: usa esta grelha, que é estrutura
 * EXPLÍCITA — a página diz, ela própria, o que é linha, o que é cabeçalho e o
 * que é célula. Lê-se com exatidão, sem heurística nenhuma.
 *
 * Estava a ser lida pelo caminho dos divs, que procura "o elemento mais fundo
 * com todos os cabeçalhos" — e esse era a linha dos títulos, onde não há
 * motoristas nenhuns. Zero linhas, sem erro, com a tabela à frente.
 *
 * Há ainda um segundo motivo para preferir a grelha: a Uber desenha a MESMA
 * lista duas vezes, uma para o telemóvel e outra para o ecrã grande, e esconde
 * uma com CSS. Pelos divs apanhavam-se as duas e cada motorista vinha a dobrar.
 */
function encontrarGrelha(cabecalhosProcurados) {
  const procurados = cabecalhosProcurados.map(normalizar);

  for (const grelha of document.querySelectorAll('[role="grid"], [role="table"]')) {
    const cabecalhos = [...grelha.querySelectorAll('[role="columnheader"]')]
      .map((c) => normalizar(texto(c)));
    if (cabecalhos.length === 0) continue;
    if (procurados.every((p) => cabecalhos.some((c) => c.includes(p)))) {
      return { tipo: 'grelha', el: grelha, cabecalhos };
    }
  }
  return null;
}

/** As linhas de uma grelha ARIA, com as colunas mapeadas por cabeçalho. */
function lerLinhasDeGrelha(grelha, cabecalhos, mapa) {
  const indices = {};
  for (const [campo, procurado] of Object.entries(mapa)) {
    const alvo = normalizar(procurado);
    // `startsWith` e não `includes`: "Rendimentos totais" e "Rendimentos
    // líquidos" partilham o prefixo, e o `includes` apanhava a coluna errada.
    indices[campo] = cabecalhos.findIndex((c) => c === alvo || c.startsWith(alvo));
  }

  const linhas = [];
  for (const linha of grelha.querySelectorAll('[role="row"]')) {
    const celulas = [...linha.querySelectorAll('[role="gridcell"]')].map(texto);
    // A linha dos títulos não tem `gridcell` nenhum, só `columnheader`. Fica
    // de fora sem ser preciso reconhecê-la por texto.
    if (celulas.length === 0) continue;

    const out = {};
    for (const [campo, i] of Object.entries(indices)) out[campo] = i >= 0 ? celulas[i] : null;
    if (out.nome && !TEXTO_DE_VAZIO.test(out.nome)) linhas.push(out);
  }
  return linhas;
}

function encontrarTabela(cabecalhosProcurados) {
  const procurados = cabecalhosProcurados.map(normalizar);

  // A grelha ARIA primeiro: é a única das três que não é adivinhada.
  const grelha = encontrarGrelha(cabecalhosProcurados);
  if (grelha) return grelha;

  for (const tabela of document.querySelectorAll('table')) {
    const celulas = [...tabela.querySelectorAll('th, thead td')].map((c) => normalizar(texto(c)));
    if (procurados.every((p) => celulas.some((c) => c.includes(p)))) {
      return { tipo: 'table', el: tabela, cabecalhos: celulas };
    }
  }

  // ── Sem <table>: encontrar o contentor da tabela feita de `div` ───────────
  //
  // A regra era "o elemento mais fundo que contenha todos os cabeçalhos", para
  // não devolver o `<body>`, que também os contém.
  //
  // E devolvia a LINHA DOS TÍTULOS. Ela contém os cabeçalhos todos e mais nada
  // — é a mais funda de todas. As linhas dos motoristas são irmãs dela, não
  // estão lá dentro. O leitor ia procurar motoristas dentro do cabeçalho e
  // voltava de mãos a abanar, sem erro nenhum: zero linhas numa tabela cheia.
  //
  // A correção é pedir também DINHEIRO. Um cabeçalho não tem valores; o
  // contentor que tem os títulos e pelo menos três importâncias é a tabela
  // inteira. E continua a valer o mais fundo, que é o que impede a subida até
  // ao `body` — onde os totais do painel ao lado seriam lidos como motoristas.
  const DINHEIRO = /(-?[\d.]+,\d{2})\s*€/g;

  let melhor = null;
  for (const el of document.querySelectorAll('div, section, [role="table"], [role="grid"]')) {
    const bruto = texto(el);
    const t = normalizar(bruto);
    if (!procurados.every((p) => t.includes(p))) continue;
    if ((bruto.match(DINHEIRO) ?? []).length < 3) continue;
    if (!melhor || el.compareDocumentPosition(melhor) & Node.DOCUMENT_POSITION_CONTAINS) {
      melhor = el;
    }
  }
  return melhor ? { tipo: 'div', el: melhor, cabecalhos: [] } : null;
}

/**
 * Lê as linhas de uma tabela HTML, mapeando colunas por cabeçalho.
 */
/**
 * Uma mensagem de "não há nada" não é um motorista.
 *
 * A Bolt, com o filtro a dar vazio, escreve "No drivers. Try changing the
 * filters" onde estariam as linhas. Isso tem duas palavras e passa por nome —
 * e entrava como um motorista a zero euros.
 *
 * A diferença importa: um motorista a zero AFIRMA que ele não trabalhou nessa
 * semana. "Não consegui ler nada" é outra coisa, e tem de se distinguir.
 *
 * Vive aqui, fora dos leitores, porque os três precisam dela — e estava só num.
 */
const TEXTO_DE_VAZIO =
  /no drivers|no data|no results|try changing|nenhum resultado|sem resultados|sem dados|nada a mostrar/i;

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
  // `tr` e não `tbody tr`: nem todas as tabelas têm `<tbody>`, e as que não têm
  // devolviam zero linhas sem dar erro — a tabela à frente e o leitor a dizer
  // que estava vazia. As linhas de cabeçalho são postas de lado a seguir.
  for (const tr of tabela.querySelectorAll('tr')) {
    // `td, th`: há tabelas que põem o nome numa célula de cabeçalho de linha.
    // Lendo só os `td`, as colunas saíam todas deslocadas uma posição.
    const celulas = [...tr.querySelectorAll('td, th')].map(texto);
    if (celulas.length === 0) continue;
    // A linha dos títulos: só `th` e nenhum `td`.
    if (tr.querySelectorAll('td').length === 0 && tr.querySelectorAll('th').length > 0) continue;

    const linha = {};
    for (const [campo, i] of Object.entries(indices)) {
      linha[campo] = i >= 0 ? celulas[i] : null;
    }
    if (linha.nome && !TEXTO_DE_VAZIO.test(linha.nome)) linhas.push(linha);
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
    //
    // O limite era 6 e deixava de fora a tabela da Uber, cuja linha tem sete
    // colunas mais a seta do fim — oito filhos. A tabela estava à vista e o
    // leitor dizia que estava vazia.
    //
    // Quem trava os contentores grandes é o limite de 200 caracteres logo a
    // seguir, não a contagem de filhos: uma linha de tabela é curta, por mais
    // colunas que tenha.
    if (el.children.length > 16) continue;

    const t = texto(el);
    if (t.length < 5 || t.length > 200) continue;

    const valores = [...t.matchAll(/(-?[\d.]+,\d{2})\s*€/g)].map((m) => m[1]);
    if (valores.length === 0) continue;

    // O nome é o que sobra antes do primeiro valor.
    const antes = t.slice(0, t.indexOf(valores[0])).trim();
    const nome = antes.replace(/^[A-Z]{2}\s+/, '').trim(); // tira iniciais tipo "DJ "
    if (nome.split(/\s+/).length < 2) continue;

    // ── Uma mensagem de "não há nada" não é um motorista ──────────────────
    //
    // A Bolt, com o filtro a dar vazio, escreve "No drivers. Try changing the
    // filters" onde estariam as linhas. Isso tem duas palavras e passava por
    // nome — e a extensão contava um motorista que não existe, com zero euros.
    //
    // Um motorista a zero entraria no fecho como quem não trabalhou nessa
    // semana, que é uma afirmação diferente de "não consegui ler nada".
    if (TEXTO_DE_VAZIO.test(nome)) continue;

    // E nenhum valor diferente de zero também não é linha nenhuma.
    if (valores.every((v) => Number(v.replace(/\./g, '').replace(',', '.')) === 0)) continue;

    const chave = `${nome}|${valores.join('|')}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    linhas.push({ nome, valores });
  }
  return linhas;
}

const extrator = {
  encontrarTabela, lerLinhasDeTable, lerLinhasDeGrelha, lerLinhasDeDivs, texto, normalizar,
};
