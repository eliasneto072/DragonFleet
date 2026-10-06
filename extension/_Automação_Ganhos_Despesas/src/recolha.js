// extension/src/recolha.js
//
// Buscar os PDFs das despesas à Via Verde e à Prio, sem os descarregar à mão.
//
// ═══ A IDEIA QUE FAZ ISTO DURAR ═════════════════════════════════════════════
//
// Não construo os pedidos. Deixo a página construí-los, apanho-os, e reenvio-os
// com as datas trocadas.
//
// A tentação é escrever o pedido no código: sei o endereço, sei os campos.
// Mas os dois portais metem lá dentro coisas que eu não controlo e que mudam
// sem aviso:
//
//   MyPrio (OutSystems)   versionInfo.moduleVersion, versionInfo.apiVersion —
//                         mudam a CADA atualização que a Prio publicar, e são
//                         diferentes por cada ação; mais o ClientId, o IsFleet
//                         e a configuração de colunas escondidas.
//
//   Via Verde             contracts, serviceTypes, paymentMethods,
//                         paymentStatuses — números que dependem do contrato.
//
// Escrito no código, isto parte-se na primeira atualização da Prio e ninguém
// percebe porquê: a extensão continua a correr, o pedido é recusado, e a
// semana fecha sem despesas.
//
// Capturado, está sempre certo. A única coisa que eu preciso de saber encontrar
// é o botão de exportar — e se ele mudar, a extensão diz-o por palavras.
//
// ═══ ONDE ISTO CORRE ════════════════════════════════════════════════════════
//
// No MUNDO PRINCIPAL da página (`world: 'MAIN'`), e não no mundo isolado da
// extensão. Duas razões, e as duas são obrigatórias:
//
//   1. Para remendar o `fetch` da página é preciso ser o `fetch` DELA. No mundo
//      isolado a extensão tem o seu, e a página nunca lhe toca.
//
//   2. O reenvio tem de ser do mesmo sítio. Os cookies de sessão da Via Verde
//      vêm `HttpOnly` e sem `SameSite`, o que em Chrome vale Lax — um pedido
//      feito a partir do endereço `chrome-extension://` seria considerado
//      externo e ia sem sessão nenhuma. Feito dentro da página, é igual a
//      qualquer outro que ela faça.
//
// ═══ O QUE ISTO NUNCA FAZ ═══════════════════════════════════════════════════
//
// Não toca em credenciais. Corre dentro da sessão que a pessoa já tem aberta,
// e se ela não estiver autenticada o pedido falha como falharia no ecrã.
// Não guarda nada. Não altera nada em portal nenhum: os dois pedidos que faz
// são de leitura — pedir uma listagem e pedir um relatório.

/* eslint-disable no-undef */

// ─────────────────────────────────────────────────────────────────────────────
// Datas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "2026-10-12" → "2026-10-12". Sem conversões, de propósito.
 *
 * A Via Verde manda as datas de duas maneiras no MESMO ecrã: na listagem em
 * UTC (`2026-08-30T23:00:00.000Z`) e no relatório em dia civil sem zeros
 * (`2026-8-31`). São o mesmo dia — 30 de agosto às 23h UTC é 31 de agosto em
 * Lisboa, que no verão está uma hora à frente.
 *
 * Converter de um para o outro parece inofensivo e é uma armadilha de inverno:
 * em novembro Lisboa fica em UTC, a hora de diferença desaparece, e a mesma
 * conta passa a dar o dia anterior. Uma semana inteira fechada com as portagens
 * de outra, uma vez por ano, quando ninguém está à espera.
 *
 * Por isso o dia civil escolhido pela pessoa nunca é convertido: é formatado
 * nos dois formatos a partir dos mesmos três números.
 */
function partesDoDia(dia) {
  const [ano, mes, d] = String(dia).split('-').map(Number);
  if (!ano || !mes || !d) throw new Error(`Data inválida: ${dia}`);
  return { ano, mes, dia: d };
}

/** "2026-8-31" — o que o relatório da Via Verde quer, sem zeros à esquerda. */
function diaSemZeros(dia) {
  const p = partesDoDia(dia);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** "2026-08-30T23:00:00.000Z" — meia-noite de Lisboa, em UTC. */
function inicioDoDiaEmUtc(dia) {
  const p = partesDoDia(dia);
  // Constrói-se meia-noite LOCAL e deixa-se o browser dizer qual é o UTC
  // correspondente. É a única forma que acerta nos dois lados do horário de
  // verão sem eu ter de saber quando ele muda.
  return new Date(p.ano, p.mes - 1, p.dia, 0, 0, 0, 0).toISOString();
}

/** O fim do dia, para o intervalo incluir o próprio último dia. */
function fimDoDiaEmUtc(dia) {
  const p = partesDoDia(dia);
  return new Date(p.ano, p.mes - 1, p.dia, 23, 59, 59, 999).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Apanhar o pedido que a página faz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remenda o `fetch` e o `XMLHttpRequest` e guarda o primeiro pedido cujo
 * endereço contenha `marca`.
 *
 * Os dois, e não só o `fetch`: o OutSystems usa `fetch`, a Via Verde usa
 * `XMLHttpRequest` através do jQuery. Remendar só um deixava metade do
 * trabalho por fazer e parecia um problema de rede.
 *
 * Devolve uma função que espera pela captura e repõe os originais. Repor é
 * importante: deixar o `fetch` remendado depois de a extensão acabar é deixar
 * código nosso a correr em cima de todos os pedidos da pessoa.
 */
function armarCaptura(marca, segundos = 30) {
  const fetchOriginal = window.fetch;
  const abrirOriginal = XMLHttpRequest.prototype.open;
  const enviarOriginal = XMLHttpRequest.prototype.send;
  const cabecalhoOriginal = XMLHttpRequest.prototype.setRequestHeader;

  let apanhado = null;
  let avisar = null;
  const espera = new Promise((resolve) => { avisar = resolve; });

  /**
   * A resposta do pedido da página, guardada à parte.
   *
   * ─── PORQUE É QUE ISTO VALE MAIS QUE REPETIR O PEDIDO ──────────────────────
   *
   * A ideia original era copiar o pedido e reenviá-lo com outras datas. Elegante
   * no papel, e a lutar contra o portal na prática: o MyPrio respondia 403 à
   * cópia, porque o `X-CSRFToken` é de uso único.
   *
   * Mas o pedido da própria página CORRE BEM — o PDF descarrega e está certo.
   * Então em vez de fazer outro, fica-se com aquele. Não há cópia, não há
   * bilhete de segurança a gastar, não há nada para o portal recusar.
   *
   * O preço é que o relatório sai com as datas que estiverem no filtro do
   * portal. Por isso a extensão CONFERE se essas datas são as da semana pedida
   * e recusa quando não são, em vez de importar o período errado — que era, de
   * todas as maneiras de isto correr mal, a única grave.
   */
  let resposta = null;
  let avisarResposta = null;
  const esperaResposta = new Promise((r) => { avisarResposta = r; });

  const guardarResposta = (texto) => {
    if (resposta !== null) return;
    resposta = texto;
    avisarResposta(texto);
  };

  const registar = (url, metodo, corpo, cabecalhos) => {
    if (apanhado) return;
    // O corpo pode vir como promessa: quando a página usa `fetch(new Request(…))`
    // o conteúdo é um fluxo que só se lê de forma assíncrona.
    apanhado = {
      url: String(url),
      metodo: (metodo || 'GET').toUpperCase(),
      corpo: corpo ?? null,
      cabecalhos: cabecalhos ?? {},
    };
    avisar(apanhado);
  };

  /**
   * Os cabeçalhos do pedido original.
   *
   * ─── PORQUE É QUE ISTO NÃO ERA OPCIONAL ────────────────────────────────────
   *
   * O MyPrio respondia 403 à cópia enquanto respondia 200 ao original, com o
   * mesmo endereço e o mesmo corpo. A diferença estava aqui: o OutSystems manda
   * um `X-CSRFToken` em todos os pedidos de screenservice, e um pedido sem ele
   * é recusado — que é o comportamento certo do lado deles, e é proteção contra
   * exatamente o tipo de coisa que esta extensão faz.
   *
   * A extensão passa a copiar os cabeçalhos do pedido que a própria página fez.
   * Não os inventa nem os guarda: leem-se no momento, reenviam-se, e ficam por
   * ali. Nunca saem do browser.
   */
  const lerCabecalhos = (entrada, opcoes) => {
    const fora = {};
    const juntar = (fonte) => {
      if (!fonte) return;
      try {
        if (typeof fonte.forEach === 'function' && !Array.isArray(fonte)) {
          fonte.forEach((v, k) => { fora[k] = v; });         // Headers
        } else if (Array.isArray(fonte)) {
          for (const [k, v] of fonte) fora[k] = v;
        } else {
          Object.assign(fora, fonte);
        }
      } catch { /* um cabeçalho ilegível não pode travar a captura */ }
    };
    if (entrada && typeof entrada !== 'string') juntar(entrada.headers);
    juntar(opcoes?.headers);
    return fora;
  };

  /**
   * O corpo do pedido, venha ele como vier.
   *
   * Havia aqui um buraco que custou uma tarde: o OutSystems chama
   * `fetch(new Request(url, { body }))` — tudo dentro do primeiro argumento,
   * nada no segundo. A captura lia `opcoes.body`, encontrava `undefined`, e a
   * extensão morria a seguir no `JSON.parse(null)` com uma mensagem que não
   * apontava a lado nenhum.
   *
   * O PDF chegava mesmo a descarregar, porque o pedido da página corria bem —
   * o que falhava era só a nossa cópia dele.
   */
  const lerCorpo = (entrada, opcoes) => {
    const cru = opcoes?.body;
    if (typeof cru === 'string') return cru;
    if (cru instanceof URLSearchParams) return cru.toString();
    if (cru != null && typeof cru !== 'object') return String(cru);
    // Um Request: o corpo só se lê clonando, e só de forma assíncrona.
    if (entrada && typeof entrada !== 'string' && typeof entrada.clone === 'function') {
      try { return entrada.clone().text(); } catch { return null; }
    }
    return null;
  };

  window.fetch = function (entrada, opcoes) {
    try {
      const url = typeof entrada === 'string' ? entrada : entrada?.url;
      if (url && String(url).includes(marca)) {
        registar(url, opcoes?.method ?? entrada?.method, lerCorpo(entrada, opcoes),
                 lerCabecalhos(entrada, opcoes));
      }
    } catch { /* nunca estragar o pedido da página por causa da captura */ }

    const promessa = fetchOriginal.apply(this, arguments);
    try {
      const url = typeof entrada === 'string' ? entrada : entrada?.url;
      if (url && String(url).includes(marca)) {
        // Clonada: ler o corpo de uma resposta consome-o, e consumi-lo aqui
        // deixava a página sem o dela.
        promessa.then((r) => r.clone().text().then(guardarResposta, () => {}), () => {});
      }
    } catch { /* idem */ }
    return promessa;
  };

  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__dfMetodo = metodo;
    this.__dfUrl = url;
    this.__dfCabecalhos = {};
    return abrirOriginal.apply(this, arguments);
  };

  // Os cabeçalhos de um XHR são postos um a um, depois do open e antes do send.
  // Sem apanhar este, a Via Verde perdia o mesmo bilhete que a Prio perdia.
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    try { (this.__dfCabecalhos ??= {})[nome] = valor; } catch { /* idem */ }
    return cabecalhoOriginal.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (corpo) {
    try {
      if (this.__dfUrl && String(this.__dfUrl).includes(marca)) {
        registar(this.__dfUrl, this.__dfMetodo, corpo ?? null, this.__dfCabecalhos);
        this.addEventListener('load', () => {
          try { guardarResposta(this.responseText); } catch { /* idem */ }
        });
      }
    } catch { /* idem */ }
    return enviarOriginal.apply(this, arguments);
  };

  const desarmar = () => {
    window.fetch = fetchOriginal;
    XMLHttpRequest.prototype.open = abrirOriginal;
    XMLHttpRequest.prototype.send = enviarOriginal;
    XMLHttpRequest.prototype.setRequestHeader = cabecalhoOriginal;
  };

  // ── A rede de segurança ────────────────────────────────────────────────────
  //
  // O gancho acima remenda o `window.fetch`. Isso chega quando a página o
  // chama por esse nome — e não chega quando ela guardou a própria referência
  // ao `fetch` no momento em que carregou, muito antes de nós existirmos.
  // Qualquer bundler moderno faz isso, e o resultado é um pedido que acontece
  // à nossa frente sem o gancho dar por ele.
  //
  // O browser, esse, regista tudo: o Resource Timing guarda o endereço de cada
  // pedido que a página fez, seja qual for o caminho por onde saiu. Não dá o
  // corpo nem os cabeçalhos — por isso não substitui o gancho, que é o único
  // que serve para a Prio — mas dá o ENDEREÇO COMPLETO, com todos os
  // parâmetros. Para a Via Verde, onde tudo vai na query string, é quanto
  // basta.
  //
  // Tira-se uma fotografia do que já lá estava ANTES do clique: senão apanhava
  // um relatório pedido há dez minutos e importava a semana errada.
  const jaVistos = new Set(
    performance.getEntriesByType('resource').map((e) => e.name),
  );

  const procurarNoHistorico = () => {
    for (const entrada of performance.getEntriesByType('resource')) {
      if (!jaVistos.has(entrada.name) && entrada.name.includes(marca)) {
        return { url: entrada.name, metodo: 'GET', corpo: null, cabecalhos: {} };
      }
    }
    return null;
  };

  return async function esperar() {
    const relogio = new Promise((_, rejeitar) =>
      setTimeout(() => rejeitar(new Error(
        `Carreguei em exportar mas o portal não chegou a pedir o relatório em ${segundos}s.\n\n`
        + 'Se nem sequer apareceu um PDF nas transferências, o clique não foi ao sítio certo. '
        + 'Se apareceu, então o portal pediu-o por um caminho que eu não estou a vigiar.',
      )), segundos * 1000));

    const vigiarHistorico = (async () => {
      for (;;) {
        const achado = procurarNoHistorico();
        if (achado) return achado;
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    try {
      const pedido = await Promise.race([espera, vigiarHistorico, relogio]);
      // Dá-se um tempo à resposta depois de o pedido ter sido visto. Se não
      // vier, não faz mal: quem chama trata disso e pede o relatório ele
      // próprio.
      const corpoResposta = await Promise.race([
        esperaResposta,
        new Promise((r) => setTimeout(() => r(null), segundos * 1000)),
      ]);
      // O corpo pode ser uma promessa (ver `lerCorpo`): resolve-se aqui, já
      // fora da chamada da página, para não a atrasar nem um milissegundo.
      return { ...pedido, corpo: await pedido.corpo, resposta: corpoResposta };
    } finally {
      desarmar();
    }
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Está mesmo à vista, e não apenas presente no HTML. */
function visivel(el) {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const estilo = getComputedStyle(el);
  return estilo.visibility !== 'hidden' && estilo.display !== 'none' && Number(estilo.opacity) !== 0;
}

/**
 * Procura um elemento clicável pelo TEXTO.
 *
 * Pelo texto e não por um caminho de HTML: um `div > div > ul > li > a` dura
 * até ao próximo retoque de desenho da página, o texto "PDF" dura anos.
 *
 * ─── DUAS ORDENS DE PREFERÊNCIA, E AS DUAS IMPORTAM ────────────────────────
 *
 * Primeiro o texto EXATO e só depois o que contém: na Via Verde há um
 * "Exportar" que abre o menu e um "Exportar Voucher" noutro sítio da página.
 * A pesquisa por "contém" apanhava o segundo.
 *
 * Primeiro `<a>` e `<button>` e só depois `<li>`: o item do menu é um `<a>`
 * dentro de um `<li>`, os dois com o texto "PDF", e quem tem o ouvinte do
 * clique é o `<a>`. Clicar no `<li>` não faz nada — e não falha; simplesmente
 * não acontece nada, que é o pior modo de falhar que há.
 */
function procurarClicavel(textos, exigirVisivel = true) {
  const grupos = [
    'a, button, [role="button"], [role="menuitem"]',
    'li, span, div',
  ];
  for (const seletor of grupos) {
    const candidatos = [...document.querySelectorAll(seletor)];
    for (const exato of [true, false]) {
      for (const el of candidatos) {
        const t = (el.textContent || '').trim().toLowerCase();
        if (!t || t.length > 40) continue;
        const bate = textos.some((p) => (exato ? t === p : t.includes(p)));
        if (!bate) continue;
        if (exigirVisivel && !visivel(el)) continue;
        return el;
      }
    }
  }
  return null;
}

/**
 * Carrega a sério, e não só com `.click()`.
 *
 * O `.click()` dispara um único evento `click`. Muitas páginas — o MyPrio
 * entre elas, que é OutSystems — reagem ao `mousedown`/`mouseup`, ou a
 * eventos de ponteiro, e ficam indiferentes a um `click` isolado.
 *
 * O sintoma disso é o pior que há: o clique não falha, não dá erro, e não
 * acontece nada. Foi exatamente o que se viu — o menu abria e o botão do PDF
 * não reagia.
 */
function clicar(el) {
  el.scrollIntoView?.({ block: 'center' });
  const opcoes = { bubbles: true, cancelable: true, view: window };
  for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    try { el.dispatchEvent(new (tipo.startsWith('pointer') ? PointerEvent : MouseEvent)(tipo, opcoes)); }
    catch { /* o browser pode não ter PointerEvent; o click abaixo continua a valer */ }
  }
  el.click();
}

/** O que existe na página com ar de botão, para a mensagem de erro ser útil. */
function textosAoAlcance() {
  return [...document.querySelectorAll('a, button, [role="button"], [role="menuitem"]')]
    .filter(visivel)
    .map((el) => (el.textContent || '').trim())
    .filter((t) => t && t.length <= 30)
    .slice(0, 25)
    .join(' · ');
}

/**
 * Carrega em exportar → PDF, abrindo o menu se for preciso.
 *
 * Os dois portais escondem o "PDF" dentro de um menu que só abre ao carregar
 * em "Exportar". Procurar logo o "PDF" encontrava-o no HTML, escondido, e o
 * clique não disparava nada: a extensão ficava trinta segundos à espera de um
 * pedido que nunca foi feito.
 *
 * Por isso: se o "PDF" já estiver à vista, carrega-se nele; senão abre-se o
 * menu primeiro e procura-se outra vez.
 */
async function carregarEmExportarPdf() {
  let pdf = procurarClicavel(['pdf']);

  if (!pdf) {
    const menu = procurarClicavel(['exportar', 'export', 'exportações']);
    if (!menu) {
      throw new Error(
        'Não encontrei o botão de exportar nesta página.\n\n'
        + `O que encontrei: ${textosAoAlcance()}`,
      );
    }
    clicar(menu);
    // O menu abre com animação. Tenta-se algumas vezes em vez de esperar um
    // tempo fixo: meio segundo chega quase sempre e não chega precisamente no
    // dia em que a página está lenta.
    for (let tentativa = 0; tentativa < 10 && !pdf; tentativa += 1) {
      await dormir(200);
      pdf = procurarClicavel(['pdf']);
    }
  }

  if (!pdf) {
    throw new Error(
      'Abri o menu de exportar mas não encontrei lá a opção PDF.\n\n'
      + `O que encontrei: ${textosAoAlcance()}`,
    );
  }

  clicar(pdf);
  return true;
}

/**
 * Os cabeçalhos a reenviar, tirando os que o browser tem de escrever sozinho.
 *
 * `Content-Length` calculado à mão fica errado assim que o corpo muda de
 * tamanho — e as datas que eu troco mudam-no. Os outros da lista são proibidos
 * de definir por código: o browser recusa-os em silêncio, e um cabeçalho
 * recusado em silêncio é meia hora a olhar para o sítio errado.
 */
const NAO_COPIAR = new Set([
  'content-length', 'host', 'connection', 'cookie', 'origin', 'referer',
  'user-agent', 'accept-encoding', 'te', 'transfer-encoding', 'upgrade',
]);

function cabecalhosParaReenvio(capturados, extra = {}) {
  const fora = { ...extra };
  for (const [nome, valor] of Object.entries(capturados ?? {})) {
    if (NAO_COPIAR.has(nome.toLowerCase())) continue;
    fora[nome] = valor;
  }
  return fora;
}

// ─────────────────────────────────────────────────────────────────────────────
// Via Verde
// ─────────────────────────────────────────────────────────────────────────────

const VIA_VERDE_PDF = '/Transactions/Default/ExportTransactionsPDF';
const VIA_VERDE_LISTA = '/Transactions/Default/GetTransactions';

/**
 * O PDF do extrato, mais as linhas em JSON para conferência cruzada.
 *
 * A Via Verde é o único dos três que dá as duas coisas: um relatório com o
 * total declarado, e uma listagem onde cada movimento já traz a matrícula.
 * Trazer as duas custa um pedido e vale muito — ver a nota da conferência
 * no fim deste ficheiro.
 *
 * ─── O ATRASO ──────────────────────────────────────────────────────────────
 *
 * Quem chama já manda as datas certas. A conta de menos sete dias é feita no
 * popup, onde está à vista de quem carrega no botão, e não escondida aqui.
 */
async function recolherViaVerde(semana) {
  const esperarPeloPedido = armarCaptura(VIA_VERDE_PDF);
  await carregarEmExportarPdf();
  const original = await esperarPeloPedido();

  // ── Primeiro caminho: a resposta que o portal já deu ─────────────────────
  //
  // Mesma ideia da Prio: se o filtro do ecrã já é a semana pedida, o relatório
  // gerado serve, e não se pede outro.
  const pedidas = new URL(original.url, location.origin).searchParams;
  const jaCerto = pedidas.get('fromDate') === diaSemZeros(semana.inicio)
               && pedidas.get('toDate') === diaSemZeros(semana.fim);
  if (jaCerto && original.resposta) {
    try {
      const j = JSON.parse(original.resposta);
      if (typeof j?.Content === 'string' && j.Content.length > 0) {
        return {
          pdfBase64: j.Content,
          nomeFicheiro: j.FileName ?? 'via-verde.pdf',
          linhas: await linhasViaVerde(original, semana).catch(() => []),
        };
      }
    } catch { /* segue para o pedido próprio */ }
  }

  // Do pedido capturado vêm os números do contrato: contracts, serviceTypes,
  // paymentMethods, paymentStatuses. Trocam-se só as datas e o número de
  // linhas — tudo o resto fica como o portal o escreveu.
  const url = new URL(original.url, location.origin);
  url.searchParams.set('fromDate', diaSemZeros(semana.inicio));
  url.searchParams.set('toDate', diaSemZeros(semana.fim));

  // A listagem vem paginada (o ecrã mostra dez de cada vez). Primeiro
  // pergunta-se quantas são, e só depois se pede o relatório — senão o PDF
  // podia sair com as dez primeiras e ar de completo.
  const linhas = await linhasViaVerde(original, semana);
  url.searchParams.set('currentRow', '1');
  url.searchParams.set('maxRows', String(Math.max(linhas.length, 500)));

  const resposta = await fetch(url.toString(), {
    credentials: 'include',
    headers: cabecalhosParaReenvio(original.cabecalhos),
  });
  if (!resposta.ok) {
    throw new Error(
      `A Via Verde recusou o pedido (${resposta.status}).\n\n`
      + `No portal, ponha o filtro em ${semana.inicio} a ${semana.fim}, carregue `
      + 'em Filtrar, e volte a carregar em "Recolher desta página".',
    );
  }

  // O PDF vem DENTRO de um JSON, em base64: {FileName, Extension, Content}.
  const corpo = await resposta.json();
  const base64 = corpo?.Content;
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('A Via Verde respondeu sem o relatório. O formato da resposta pode ter mudado.');
  }

  return { pdfBase64: base64, nomeFicheiro: corpo.FileName ?? 'via-verde.pdf', linhas };
}

/** As linhas do extrato, com matrícula, direto da listagem. */
async function linhasViaVerde(pedidoOriginal, semana) {
  // Os parâmetros do contrato vêm do endereço capturado; a listagem quer as
  // mesmas coisas em JSON e com outros nomes.
  const p = new URL(pedidoOriginal.url, location.origin).searchParams;
  const lista = (nome) => (p.get(nome) ?? '').split(',').filter(Boolean).map(Number);

  const pedir = async (primeiraLinha, quantas) => {
    const r = await fetch(new URL(VIA_VERDE_LISTA, location.origin).toString(), {
      method: 'POST',
      credentials: 'include',
      headers: cabecalhosParaReenvio(pedidoOriginal.cabecalhos, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        contractList: lista('contracts'),
        serviceTypeList: lista('serviceTypes'),
        paymentMethodList: lista('paymentMethods'),
        paymentStatusList: lista('paymentStatuses'),
        maxRows: quantas,
        currentRow: primeiraLinha,
        fromDate: inicioDoDiaEmUtc(semana.inicio),
        toDate: fimDoDiaEmUtc(semana.fim),
        identifiers: [],
        licensePlateList: [],
      }),
    });
    if (!r.ok) throw new Error(`A Via Verde recusou a listagem (${r.status}).`);
    return r.json();
  };

  const primeira = await pedir(1, 200);
  const total = Number(primeira?.TotalRows ?? 0);
  const movimentos = [...(primeira?.Transactions ?? [])];

  // Páginas seguintes, se as houver. O limite de 20 voltas é um travão: uma
  // resposta que nunca cresça poria isto a pedir para sempre.
  for (let volta = 0; movimentos.length < total && volta < 20; volta += 1) {
    const seguinte = await pedir(movimentos.length + 1, 200);
    const novas = seguinte?.Transactions ?? [];
    if (novas.length === 0) break;
    movimentos.push(...novas);
  }

  return movimentos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prio
// ─────────────────────────────────────────────────────────────────────────────

const PRIO_PDF = 'ExportTransactionsBlock/DataActionGeneratePDF';

/**
 * O relatório de uma das duas páginas da Prio.
 *
 * ─── PORQUE É QUE NÃO DISTINGO COMBUSTÍVEL DE CARREGAMENTOS ────────────────
 *
 * Porque não preciso, e é isso que torna isto seguro. As duas páginas
 * (`/Transactions/Transactions` e `?TradIsElectric=True`) chamam o MESMO
 * endereço; o que muda é um `IsFleet` — `true` no combustível, `false` nos
 * carregamentos — e a lista de colunas escondidas.
 *
 * Como o pedido é capturado na página onde a extensão está, esses dois campos
 * vêm sempre corretos. Se eu os escrevesse aqui, bastava trocá-los uma vez
 * para importar carregamentos elétricos como combustível: as duas contas
 * ficavam trocadas nas estatísticas e nada no ecrã dava por isso.
 *
 * ─── AS DATAS VÃO NOS DOIS BLOCOS ──────────────────────────────────────────
 *
 * O pedido leva sempre `FiltersTransactions_OAPI` e
 * `FiltersElectricTransactions_OAPI`, e o que não pertence à página vai com
 * restos da outra. Dá para deduzir qual é que o servidor lê — mas é uma
 * dedução, e se estivesse errada importava a semana errada com ar de certa.
 * Escrever a semana nos dois custa uma linha e elimina o palpite.
 */
async function recolherPrio(semana) {
  const esperarPeloPedido = armarCaptura(PRIO_PDF);
  await carregarEmExportarPdf();
  const original = await esperarPeloPedido();

  let corpo;
  try {
    corpo = JSON.parse(original.corpo);
  } catch {
    throw new Error('Não consegui ler o pedido que o MyPrio fez. O portal pode ter mudado.');
  }

  const variaveis = corpo?.screenData?.variables;
  if (!variaveis) throw new Error('O pedido do MyPrio veio sem filtros. O portal pode ter mudado.');

  const eletrico = variaveis.IsFleet === false;
  const bloco = eletrico ? 'FiltersElectricTransactions_OAPI' : 'FiltersTransactions_OAPI';
  const filtro = variaveis[bloco] ?? {};

  // ── Primeiro caminho: aproveitar a resposta que o portal já deu ───────────
  //
  // Se o filtro do ecrã já é a semana que se quer, o relatório que acabou de
  // ser gerado é exatamente o que precisamos. Não se pede outro — e onde não
  // há segundo pedido não há 403.
  const daSemana = filtro.StartDate === semana.inicio && filtro.EndDate === semana.fim;
  if (daSemana && original.resposta) {
    try {
      const pdf = JSON.parse(original.resposta)?.data?.PDF;
      if (typeof pdf === 'string' && pdf.length > 0) {
        return {
          pdfBase64: pdf,
          eletrico,
          nomeFicheiro: eletrico ? 'prio-electric.pdf' : 'prio-frota.pdf',
        };
      }
    } catch { /* não deu: segue para o pedido próprio, aqui em baixo */ }
  }

  // ── Segundo caminho: pedir um relatório com as datas certas ───────────────
  //
  // Só se chega aqui quando o filtro do ecrã é de outro período. O MyPrio
  // costuma recusar esta cópia com 403, porque o bilhete de segurança é de uso
  // único — e nesse caso a mensagem abaixo diz o que fazer, que é pôr as datas
  // no filtro do portal e repetir. Mais chato, e infalível.
  for (const nome of ['FiltersTransactions_OAPI', 'FiltersElectricTransactions_OAPI']) {
    if (variaveis[nome]) {
      variaveis[nome].StartDate = semana.inicio;
      variaveis[nome].EndDate = semana.fim;
    }
  }

  const resposta = await fetch(original.url, {
    method: 'POST',
    credentials: 'include',
    // Com os cabeçalhos do pedido original, e o `X-CSRFToken` entre eles. Sem
    // ele o MyPrio responde 403 — ao original responde 200, com o mesmo
    // endereço e o mesmo corpo.
    headers: cabecalhosParaReenvio(original.cabecalhos, {
      'Content-Type': 'application/json; charset=UTF-8',
    }),
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    throw new Error(
      `O MyPrio recusou o pedido (${resposta.status}).\n\n`
      + `No portal, ponha o filtro de datas em ${semana.inicio} a ${semana.fim}, `
      + 'carregue em Filtrar, e volte a carregar em "Recolher desta página". '
      + 'Assim eu aproveito o relatório que o portal gera, em vez de pedir outro.',
    );
  }

  const json = await resposta.json();
  const base64 = json?.data?.PDF;
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('O MyPrio respondeu sem o relatório. O formato da resposta pode ter mudado.');
  }

  return {
    pdfBase64: base64,
    eletrico,
    nomeFicheiro: eletrico ? 'prio-electric.pdf' : 'prio-frota.pdf',
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * O ponto de entrada, injetado no mundo principal da página.
 *
 * Devolve o erro em vez de o lançar: uma exceção dentro do `executeScript`
 * chega ao popup como "resultado indefinido", sem mensagem — e um erro sem
 * mensagem é indistinguível de não ter acontecido nada.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Pôr as datas no filtro do portal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escreve num campo de forma que a página DÊ POR ISSO.
 *
 * `input.value = '...'` muda o que se vê e não muda o que a página pensa: as
 * páginas modernas guardam o valor no seu próprio estado e só o atualizam
 * quando recebem um evento. O campo ficava com a data nova, o filtro continuava
 * com a antiga, e o relatório saía do período errado — sem nada no ecrã a
 * denunciar, que é o pior que podia acontecer aqui.
 *
 * O `setter` nativo existe por causa do React e companhia: eles substituem o
 * `value` do elemento por um seu, e escrever por cima dele não dispara nada.
 * Chamando o setter original, o evento seguinte é visto como uma escrita real.
 */
function escreverNoCampo(campo, valor) {
  const prototipo = Object.getPrototypeOf(campo);
  const setter = Object.getOwnPropertyDescriptor(prototipo, 'value')?.set;
  campo.focus?.();
  if (setter) setter.call(campo, valor); else campo.value = valor;
  for (const tipo of ['input', 'change']) {
    campo.dispatchEvent(new Event(tipo, { bubbles: true }));
  }
  campo.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * O formato de uma data escrita, ou null se não for reconhecível.
 *
 * Os quatro portais usam três convenções diferentes, e a da Uber — ano
 * primeiro, com barras — era a que faltava. Escrever `10/08/2026` num campo
 * que espera `2026/08/10` dá uma data que o portal lê como outra qualquer, ou
 * não lê de todo.
 */
function formatoDaData(valor) {
  const v = (valor || '').trim();
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) return 'aaaa/mm/dd';   // Uber
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'aaaa-mm-dd';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return 'dd/mm/aaaa';   // Via Verde, Prio
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) return 'dd-mm-aaaa';
  return null;
}

/** Uma data no formato indicado. */
function escreverDataComo(formato, dia) {
  const [ano, mes, d] = dia.split('-');
  switch (formato) {
    case 'aaaa/mm/dd': return `${ano}/${mes}/${d}`;
    case 'aaaa-mm-dd': return dia;
    case 'dd-mm-aaaa': return `${d}-${mes}-${ano}`;
    default:           return `${d}/${mes}/${ano}`;
  }
}

/**
 * Os dois campos de data do filtro, pela ordem em que aparecem.
 *
 * Aceita campos VAZIOS desde que estejam ao lado de um com data: na Uber o
 * "Start Date" começa em branco e só o "End Date" tem valor, e exigir que os
 * dois tivessem data deixava os dois de fora.
 */
function camposDeData() {
  const candidatos = [...document.querySelectorAll('input')].filter(visivel);

  const comData = candidatos.filter((c) =>
    c.type === 'date' || formatoDaData(c.value) !== null);
  if (comData.length >= 2) return comData.slice(0, 2);

  // Um só com data: procura o vizinho vazio, que é o par dele. Aceita-se um
  // campo de texto vazio porque é isso que a Uber mostra.
  if (comData.length === 1) {
    const i = candidatos.indexOf(comData[0]);
    const vizinho = candidatos[i - 1] ?? candidatos[i + 1];
    if (vizinho && (vizinho.value || '').trim() === '') {
      return i > 0 ? [vizinho, comData[0]] : [comData[0], vizinho];
    }
  }

  return comData.slice(0, 2);
}

/**
 * Abre o seletor de datas, quando ele está fechado.
 *
 * A Uber não mostra campos de data nenhuns até se carregar na etiqueta com o
 * intervalo ("28/09/2026 04:04 AM - 03/10/2026 12:55 AM") e depois escolher
 * "Intervalo personalizado". Sem estes dois cliques não há onde escrever.
 *
 * Devolve `true` se chegou a abrir alguma coisa. Nos portais onde os campos já
 * estão à vista — a Prio e a Via Verde — nem é chamada.
 */
function etiquetaDeIntervalo() {
  return [...document.querySelectorAll('button, [role="button"], a, div, span')]
    .filter(visivel)
    .find((el) => {
      const t = (el.textContent || '').trim();
      if (t.length > 70) return false;
      // Dois formatos de etiqueta: a da Uber traz datas completas
      // ("28/09/2026 04:04 AM - 03/10/2026"), a da Bolt traz dia e mês
      // abreviado em inglês ("26 Sep - 2 Oct").
      return /\d{2}\/\d{2}\/\d{4}[\s\S]*[-–][\s\S]*\d{2}\/\d{2}\/\d{4}/.test(t)
          || /\d{1,2}\s+[A-Za-z]{3}[a-z]*\s*[-–]\s*\d{1,2}\s+[A-Za-z]{3}/.test(t);
    }) ?? null;
}

/**
 * Abre o seletor de datas, quando ele está fechado.
 *
 * A Uber e a Bolt não mostram campo nenhum até se carregar na etiqueta com o
 * intervalo e, na Uber, escolher ainda "Intervalo personalizado".
 */
async function abrirSeletorDeDatas() {
  const etiqueta = etiquetaDeIntervalo();
  if (!etiqueta) return false;

  clicar(etiqueta);
  await dormir(600);

  // O separador do intervalo livre. Sem ele, os campos ficam só de leitura:
  // o outro separador é o dos períodos de pagamento, que não se escrevem.
  const personalizado = procurarClicavel([
    'intervalo personalizado', 'personalizado', 'custom range', 'custom',
  ]);
  if (personalizado) {
    clicar(personalizado);
    await dormir(500);
  }
  return true;
}

const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** O dia seguinte, em "AAAA-MM-DD". Construído em UTC para não saltar com o
 *  horário de verão. */
function maisUmDia(dia) {
  const [a, m, d] = dia.split('-').map(Number);
  const seguinte = new Date(Date.UTC(a, m - 1, d + 1));
  const p = (n) => String(n).padStart(2, '0');
  return `${seguinte.getUTCFullYear()}-${p(seguinte.getUTCMonth() + 1)}-${p(seguinte.getUTCDate())}`;
}

/** "2026-09-14" → "14 Sep", que é como a Bolt escreve. */
function diaEMesCurto(dia) {
  const [, mes, d] = dia.split('-').map(Number);
  return `${d} ${MESES_EN[mes - 1]}`;
}

/**
 * O campo ÚNICO que leva o intervalo todo escrito.
 *
 * A Bolt não tem dois campos nem obriga a carregar nos dias: tem uma caixa com
 * `26 Sep - 2 Oct` lá dentro, que se escreve de uma vez. Escrever é bastante
 * mais fiável do que navegar meses e acertar na célula certa de uma grelha —
 * por isso este caminho é tentado ANTES do calendário.
 */
function campoDeIntervalo() {
  // Pelo VALOR — `3 Oct - 3 Oct` — e também pelo PLACEHOLDER, que na Bolt é
  // `d MMM - d MMM` e diz o formato exato que ela espera: dia sem zero à
  // frente e mês em três letras.
  //
  // O placeholder importa por si: um campo vazio não tem valor nenhum para
  // reconhecer, e sem isto a caixa passava despercebida sempre que o filtro
  // tivesse sido limpo.
  const padraoValor = /\d{1,2}\s+[A-Za-z]{3}[a-z]*\s*[-–]\s*\d{1,2}\s+[A-Za-z]{3}/;
  const padraoPlaceholder = /d\s*MMM\s*[-–]\s*d\s*MMM|dd?\/mm.*[-–]/i;

  return [...document.querySelectorAll('input, textarea, [contenteditable="true"]')]
    .filter(visivel)
    .find((c) => padraoValor.test((c.value ?? c.textContent ?? '').trim())
               || padraoPlaceholder.test(c.placeholder ?? '')) ?? null;
}

const MESES = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6,
  jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
};

/** O mês e o ano que o calendário está a mostrar, lido do seu cabeçalho. */
function mesVisivel() {
  for (const el of document.querySelectorAll('div, span, h1, h2, h3, h4, button')) {
    if (!visivel(el)) continue;
    const t = (el.textContent || '').trim();
    if (t.length > 24) continue;
    const m = /^([A-Za-zçÇáéíóúâêôãõ]{3,})\.?\s+(\d{4})$/.exec(t);
    if (!m) continue;
    const mes = MESES[m[1].slice(0, 3).toLowerCase()];
    if (mes) return { mes, ano: Number(m[2]) };
  }
  return null;
}

/** O botão de avançar ou recuar um mês. */
function setaDoCalendario(frente) {
  const marcas = frente
    ? ['next month', 'próximo', 'proximo', 'seguinte', 'next', '›', '>', '→', '❯']
    : ['previous month', 'anterior', 'previous', 'prev', '‹', '<', '←', '❮'];
  const candidatos = [...document.querySelectorAll('button, [role="button"], a')].filter(visivel);
  for (const el of candidatos) {
    const alvo = `${el.getAttribute('aria-label') ?? ''} ${(el.textContent ?? '').trim()}`
      .toLowerCase();
    if (marcas.some((m) => alvo.includes(m))) return el;
  }
  return null;
}

/**
 * Carrega num dia do calendário aberto.
 *
 * ─── O CUIDADO QUE ISTO TEM DE TER ─────────────────────────────────────────
 *
 * Um calendário mostra sempre dias do mês anterior e do seguinte para encher a
 * grelha — no de setembro aparecem o 31 de agosto e o 1, 2, 3 de outubro, a
 * cinzento. Carregar no "2" errado escolhe 2 de outubro em vez de 2 de
 * setembro, e a semana sai trocada sem nada no ecrã a denunciar.
 *
 * Por isso os dias de fora ficam excluídos pela marca que os distingue, e não
 * pela cor — a cor varia com o tema.
 */
function carregarNoDia(dia) {
  const fora = /outside|disabled|muted|other|adjacent|prev|next|faded|inactive/i;
  const celulas = [...document.querySelectorAll(
    'td, [role="gridcell"], button, span, div',
  )].filter((el) => {
    if (!visivel(el)) return false;
    if ((el.textContent || '').trim() !== String(dia)) return false;
    if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return false;
    if (fora.test(el.className || '') || fora.test(el.parentElement?.className || '')) return false;
    return true;
  });
  if (celulas.length === 0) return false;
  clicar(celulas[0]);
  return true;
}

/**
 * Escolhe o intervalo carregando nos dias — o mecanismo da Bolt.
 *
 * Não há campos para escrever: há uma grelha de dias. Navega-se até ao mês de
 * cada data, carrega-se no dia, e o portal trata do resto.
 */
async function escolherNoCalendario(semana) {
  for (const [ordem, dia] of [['inicio', semana.inicio], ['fim', semana.fim]]) {
    const [ano, mes, d] = dia.split('-').map(Number);

    // Navegar até ao mês certo. Vinte e quatro passos chegam para dois anos em
    // qualquer direção, e travam um calendário que não reaja às setas.
    let chegou = false;
    for (let passo = 0; passo < 24; passo += 1) {
      const atual = mesVisivel();
      if (!atual) break;
      if (atual.ano === ano && atual.mes === mes) { chegou = true; break; }
      const paraFrente = atual.ano < ano || (atual.ano === ano && atual.mes < mes);
      const seta = setaDoCalendario(paraFrente);
      if (!seta) break;
      clicar(seta);
      await dormir(250);
    }
    if (!chegou) {
      throw new Error(
        `Não consegui levar o calendário até ${dia}. Escolha o período à mão e volte a tentar.`,
      );
    }

    if (!carregarNoDia(d)) {
      throw new Error(`Não encontrei o dia ${d} no calendário (${ordem} da semana).`);
    }
    await dormir(600);
  }
}

/**
 * Põe a semana no filtro do portal e manda filtrar.
 *
 * ─── PORQUE É QUE ISTO CONFERE NO FIM ──────────────────────────────────────
 *
 * Porque a única maneira grave de isto correr mal é descarregar o período
 * errado: o PDF sai coerente consigo próprio, as contas fecham, e a semana
 * fecha com as despesas de outra sem ninguém dar por nada.
 *
 * Por isso, depois de escrever, relê os campos. Se não ficaram com o que devia,
 * PARA — e diz o que lá está, em vez de exportar na mesma.
 */
/**
 * Confere o que ficou escrito na caixa do intervalo.
 *
 * Seja o menu a preenchê-la, seja a extensão a escrevê-la, o que conta é o que
 * lá ficou. Sem esta leitura, um clique que não pegasse deixava o filtro no
 * período de antes — e a recolha seguia, com os ganhos de outra semana.
 */
async function conferirIntervaloEscrito(semana) {
  const caixa = campoDeIntervalo();
  if (!caixa) return;                      // nada para conferir
  const escrito = (caixa.value ?? '').toLowerCase();
  const esperado = [diaEMesCurto(semana.inicio), diaEMesCurto(semana.fim)]
    .map((t) => t.toLowerCase());
  if (!esperado.every((t) => escrito.includes(t))) {
    throw new Error(
      `O filtro da Bolt ficou em "${caixa.value}" e a semana a fechar é `
      + `${esperado[0]} a ${esperado[1]}. Acerte-o à mão e volte a tentar.`,
    );
  }
}

/**
 * Abre um menu, e confirma pelo `aria-expanded` que ficou aberto.
 *
 * ─── PORQUE É QUE UM MENU NÃO SE ABRE COMO UM BOTÃO ────────────────────────
 *
 * O `clicar()` dispara a sequência toda de eventos de rato — pointerdown,
 * mousedown, pointerup, mouseup, click. Foi preciso assim para o botão do PDF
 * do MyPrio, que é OutSystems e ignora um `click` isolado.
 *
 * Num menu que ALTERNA, essa mesma sequência faz o contrário do que se quer: o
 * menu abre no `pointerdown` e volta a fechar no `click`. Fica tudo como
 * estava, sem erro nenhum — o que resolveu um portal parte o outro.
 *
 * Por isso aqui tenta-se do mais suave para o mais insistente, e pergunta-se
 * ao próprio elemento se ficou aberto. O `aria-expanded` é a resposta dele,
 * não uma dedução minha.
 */
async function abrirMenu(el) {
  const aberto = () => el.getAttribute('aria-expanded') === 'true';

  // 1. Só o click. É o que a maioria dos menus espera.
  el.click();
  await dormir(500);
  if (aberto()) return true;

  // 2. Pointer sem click: para os que abrem ao premir e fechariam ao soltar.
  const opcoes = { bubbles: true, cancelable: true, view: window };
  for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    try { el.dispatchEvent(new (tipo.startsWith('pointer') ? PointerEvent : MouseEvent)(tipo, opcoes)); }
    catch { /* sem PointerEvent segue-se para o teclado */ }
  }
  await dormir(500);
  if (aberto()) return true;

  // 3. O teclado. Um menu acessível abre com Enter ou com a seta para baixo, e
  //    este caminho não alterna — é a saída para os que teimam.
  el.focus?.();
  for (const key of ['Enter', 'ArrowDown']) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await dormir(400);
    if (aberto()) return true;
  }

  return aberto();
}

/** A semana pedida é mesmo a semana passada, vista de hoje? */
function ehSemanaPassada(semana) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  // Recua até à segunda desta semana e depois mais sete dias.
  hoje.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7) - 7);
  const p = (n) => String(n).padStart(2, '0');
  const segunda = `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
  hoje.setDate(hoje.getDate() + 6);
  const domingo = `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
  return semana.inicio === segunda && semana.fim === domingo;
}

/**
 * O atalho da Bolt: escolher "Last week" no menu em vez de escrever datas.
 *
 * ─── PORQUE É QUE ISTO É MELHOR DO QUE ESCREVER ────────────────────────────
 *
 * Porque não depende de convencer uma caixa a aceitar texto. Dois cliques num
 * menu que o portal já tem, e é ele próprio a pôr 21 Sep - 27 Sep.
 *
 * ─── E PORQUE É QUE SÓ VALE ÀS VEZES ───────────────────────────────────────
 *
 * "Last week" é relativo a HOJE. Coincide com a semana pedida quando se está a
 * fechar a semana passada, que é o caso normal — mas se um dia se fechar uma
 * semana de há um mês, este botão punha lá outro período. E seria o pior tipo
 * de erro: silencioso, com números plausíveis.
 *
 * Por isso compara-se primeiro. Não coincidindo, devolve `false` e escreve-se
 * o intervalo à mão, como antes.
 */
async function escolherSemanaPassadaNaBolt(semana, registo) {
  if (!ehSemanaPassada(semana)) { registo.push('nao e a semana passada'); return false; }

  const procurarTodos = () => [...document.querySelectorAll('button, [role="button"], [role="menuitem"], li, a')]
    .filter(visivel)
    .filter((el) => ['last week', 'semana passada'].includes(
      (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' '),
    ));

  // Fechado, há um só elemento com este texto: o botão que abre o menu. Com o
  // menu aberto passam a ser dois, e o que interessa é o de dentro.
  const antes = procurarTodos();

  // O botão que abre o menu mostra a opção ESCOLHIDA, não um título fixo: pode
  // dizer "Today", "Last 7 days", "Last week"… Reconhece-se melhor pelo
  // `aria-haspopup="menu"`, que não muda com o que estiver selecionado.
  const abrir = [...document.querySelectorAll('[aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"]')]
      .filter(visivel)
      .find((el) => /today|last week|last 7 days|last month|custom|hoje|semana/i.test(el.textContent || ''))
    ?? procurarClicavel(['today', 'last week', 'last 7 days', 'semana passada']);
  if (!abrir) { registo.push('nao encontrei o botao do menu'); return false; }

  if (!await abrirMenu(abrir)) { registo.push('o menu nao abriu'); return false; }
  registo.push('menu aberto');
  await dormir(400);

  const depois = procurarTodos();
  registo.push(`opcoes "last week" visiveis: ${depois.length}`);
  const item = depois.find((el) => !antes.includes(el)) ?? depois[0];
  if (!item) { registo.push('nao encontrei a opcao Last week'); return false; }

  // ── Não se prevê o resultado: confirma-se ────────────────────────────────
  //
  // Em vez de carregar e assumir que ficou bem, carrega-se e LÊ-SE o campo.
  // "Last week" é relativo a hoje e pode não ser a semana pedida; o portal
  // pode não reagir; o clique pode não pegar. Em qualquer desses casos isto
  // devolve `false` e quem chama escreve as datas à mão, como antes.
  const esperado = diaEMesCurto(semana.inicio).toLowerCase();
  const ficouBem = () =>
    (campoDeIntervalo()?.value ?? '').toLowerCase().includes(esperado);

  item.click();
  await dormir(1500);
  if (ficouBem()) { registo.push('ficou certo ao primeiro click'); return true; }

  clicar(item);
  await dormir(1800);
  if (ficouBem()) { registo.push('ficou certo com os eventos de rato'); return true; }

  registo.push(`depois de carregar, o campo ficou "${campoDeIntervalo()?.value ?? '(sem campo)'}"`);
  return false;
}

async function porDatasNoFiltro(semana, registo = []) {
  // Na Bolt, o menu de predefinições antes de tudo: ver a nota acima. Se não
  // der, segue-se para a escrita — não se desiste, tenta-se o outro caminho.
  if (location.hostname.includes('bolt.eu')
      && await escolherSemanaPassadaNaBolt(semana, registo)) {
    await conferirIntervaloEscrito(semana);
    return;
  }

  // ── Uma caixa com o intervalo à vista resolve tudo, sem abrir nada ───────
  //
  // É o caso da Bolt: um `input` com `3 Oct - 3 Oct` lá dentro e o
  // `placeholder` a dizer o formato — `d MMM - d MMM`. Não há botão nenhum
  // para carregar antes.
  //
  // Isto estava no FIM da função, depois de tentar abrir um seletor que ali
  // não existe. Agora vem primeiro: se a caixa está à vista, escreve-se nela e
  // acabou. Os outros portais não têm nada parecido, por isso não lhes toca.
  const caixaDireta = campoDeIntervalo();
  if (caixaDireta) {
    const texto = `${diaEMesCurto(semana.inicio)} - ${diaEMesCurto(semana.fim)}`;
    escreverNoCampo(caixaDireta, texto);
    for (const tipo of ['keydown', 'keyup']) {
      caixaDireta.dispatchEvent(new KeyboardEvent(tipo, {
        key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true,
      }));
    }
    await dormir(2000);
    await conferirIntervaloEscrito(semana);
    return;
  }

  // ── Uma etiqueta de intervalo manda sobre tudo o resto ───────────────────
  //
  // Se a página tem uma etiqueta do género `26 Sep - 2 Oct`, é ela o filtro de
  // datas, e abre-se PRIMEIRO. Antes só se abria quando não havia campos à
  // vista — e na Bolt há outros campos na página com ar de data, por isso o
  // código dava-se por satisfeito, escrevia nos campos errados, e o filtro não
  // mudava. Era exatamente o "não mudou nada".
  //
  // A Prio e a Via Verde não têm etiqueta nenhuma, por isso continuam pelo
  // caminho de sempre, intocadas.
  let abriuSeletor = false;
  if (etiquetaDeIntervalo()) {
    abriuSeletor = await abrirSeletorDeDatas();
  }

  let campos = camposDeData();
  if (campos.length < 2 && !abriuSeletor) {
    abriuSeletor = await abrirSeletorDeDatas();
    campos = camposDeData();
  }

  // Sem dois campos? Pode ser uma caixa só com o intervalo inteiro — a Bolt.
  if (campos.length < 2) {
    const intervalo = campoDeIntervalo();
    if (intervalo) {
      const texto = `${diaEMesCurto(semana.inicio)} - ${diaEMesCurto(semana.fim)}`;
      escreverNoCampo(intervalo, texto);
      // Enter a fechar: estas caixas costumam só aceitar o que lá está quando
      // se confirma, e sem isso o texto fica escrito e o filtro não muda.
      for (const tipo of ['keydown', 'keyup']) {
        intervalo.dispatchEvent(new KeyboardEvent(tipo, {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true,
        }));
      }
      await dormir(1500);
      return;
    }

    // Nem campos nem caixa: resta a grelha de dias.
    if (abriuSeletor && mesVisivel()) {
      await escolherNoCalendario(semana);
      await dormir(1500);
      return;
    }
    throw new Error(
      'Não encontrei os campos de data do filtro nesta página.\n\n'
      + 'Ponha o período à mão e volte a tentar.',
    );
  }

  const [de, ate] = campos;

  // ── A Uber MOSTRA um dia a mais do que o que se escreve ──────────────────
  //
  // O portal explica a sua semana: começa às segundas às 04:00 e acaba às
  // 03:59 da segunda seguinte. Por isso a etiqueta de 21 a 27 de setembro
  // aparece como `21/09 04:00 — 28/09 04:00`.
  //
  // Mas isso é a ETIQUETA, não o campo. No campo escreve-se o último dia a
  // sério — 27 — e é a Uber que acrescenta o dia ao mostrar.
  //
  // Eu li a etiqueta e escrevi 28. Resultado: ela passou a mostrar 29, e a
  // conferência recusou — e ainda bem que recusou, porque era uma semana de
  // oito dias a entrar como se fosse de sete.
  //
  // O +1 continua a existir, mas só do lado de quem LÊ a etiqueta para
  // conferir (no popup), nunca do lado de quem escreve.
  const fimDoIntervalo = semana.fim;

  // O formato vem do campo que TIVER valor, e vale para os dois. Na Uber o
  // "Start Date" está vazio e só o "End Date" mostra `2026/10/03` — sem olhar
  // para o vizinho, escrevia-se no formato errado naquele que interessa.
  const formato = de.type === 'date' ? 'aaaa-mm-dd'
    : (formatoDaData(de.value) ?? formatoDaData(ate.value) ?? 'dd/mm/aaaa');

  escreverNoCampo(de, escreverDataComo(formato, semana.inicio));
  await dormir(300);

  // O segundo campo é procurado OUTRA VEZ.
  //
  // Escrever no primeiro faz estes seletores redesenharem-se, e a referência
  // guardada há um instante deixa de apontar para o que está no ecrã — a
  // escrita seguinte ia para um elemento que já não existe. O sintoma era
  // perfeito: "à primeira só trocou a primeira data; carreguei outra vez e aí
  // trocou a final".
  const segundo = camposDeData()[1] ?? ate;
  escreverNoCampo(segundo, escreverDataComo(formato, fimDoIntervalo));
  await dormir(500);

  const confere = (campo, dia) => {
    const [ano, mes, d] = dia.split('-');
    const escrito = (campo.value || '').replace(/\D/g, '');
    return escrito.includes(ano) && escrito.includes(mes) && escrito.includes(d);
  };
  const [deAgora, ateAgora] = camposDeData().length >= 2 ? camposDeData() : [de, segundo];
  if (!confere(deAgora, semana.inicio) || !confere(ateAgora, fimDoIntervalo)) {
    throw new Error(
      `Escrevi as datas mas o filtro não as aceitou — ficou "${deAgora.value}" a "${ateAgora.value}".\n\n`
      + `Ponha ${semana.inicio} a ${fimDoIntervalo} à mão, carregue em Filtrar, e volte a tentar.`,
    );
  }

  const filtrar = procurarClicavel([
    'filtrar', 'pesquisar', 'aplicar', 'procurar',
    // A Uber e a Bolt estão em inglês. "ok" fica de fora de propósito: é
    // curto de mais e apanharia qualquer caixa de diálogo que estivesse aberta.
    'apply', 'search', 'update', 'confirm', 'done',
  ]);

  if (filtrar) {
    clicar(filtrar);
  } else if (!abriuSeletor) {
    // Na Prio e na Via Verde o botão TEM de existir: sem ele as datas ficam
    // escritas e o relatório sai do período antigo.
    throw new Error('Pus as datas mas não encontrei o botão de Filtrar nesta página.');
  } else {
    // Num seletor que se abriu, muitas vezes não há botão: fecha-se e a página
    // aplica sozinha. Quem chama confere o período no fim, de qualquer forma.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.click();
  }

  // A tabela demora a recarregar. Exportar antes disso dava o relatório do
  // período anterior — o erro que esta função existe para evitar.
  await dormir(3000);
}

/**
 * Carrega em exportar. Mais nada.
 *
 * É este o ponto de entrada que a extensão usa hoje: o PDF vai parar à pasta
 * de transferências e é de lá que o service worker o lê. Tentar apanhá-lo aqui
 * dentro da página foi o caminho que não deu — ver a nota no topo do
 * background.js.
 */
/**
 * Quantos movimentos a página mostra, depois de filtrada.
 *
 * ─── PARA QUE SERVE ─────────────────────────────────────────────────────────
 *
 * Para não descarregar um relatório que se sabe vazio. A Prio demora bastante
 * a gerar o PDF, e há semanas sem abastecimento nenhum — esperar meio minuto
 * por um documento em branco é tempo perdido duas vezes, porque depois o
 * leitor diz "não encontrei nada" e trava o fecho inteiro.
 *
 * ─── E PORQUE É QUE DEVOLVE null EM VEZ DE ZERO ─────────────────────────────
 *
 * Porque "não consegui contar" e "não há nada" não são a mesma coisa, e
 * confundi-las aqui seria caro: um zero inventado faz a extensão saltar o
 * download de uma semana que TINHA despesas, e essas desaparecem do fecho sem
 * nada a dizê-lo.
 *
 * Só se salta o download quando se LÊ um zero. Na dúvida, descarrega-se.
 */
/**
 * O texto da página, numa linha, para procurar frases.
 *
 * ─── SÓ O QUE ESTÁ À VISTA ─────────────────────────────────────────────────
 *
 * `document.body.textContent` traz TUDO, incluindo o que está escondido. E
 * estas páginas guardam mensagens prontas a mostrar — um "Sem registos" à
 * espera, um "A carregar" por trás — que nunca chegaram ao ecrã.
 *
 * Lidas às cegas, a mais perigosa é a de vazio: uma frase escondida fazia a
 * extensão saltar o download de uma semana que TINHA despesas, e essas
 * desapareciam do fecho sem nada a dizê-lo. É exatamente o engano que todo
 * este contador existe para não cometer.
 *
 * Percorre-se os nós de texto e pergunta-se, por cada um, se o pai está
 * visível. É mais lento do que ler o `textContent` de uma vez; corre duas ou
 * três vezes por recolha, o que torna a diferença irrelevante.
 */
function textoDaPagina() {
  const caminhante = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const pedacos = [];
  for (let no = caminhante.nextNode(); no; no = caminhante.nextNode()) {
    const texto = no.nodeValue;
    if (!texto || !texto.trim()) continue;
    const pai = no.parentElement;
    if (!pai || !visivel(pai)) continue;
    pedacos.push(texto);
  }
  return pedacos.join(' ').replace(/\s+/g, ' ');
}

/**
 * Quantas linhas de dados tem a tabela de resultados, ou `null` se não houver
 * tabela nenhuma reconhecível.
 *
 * ─── PORQUE NÃO CHEGA CONTAR `tr` ──────────────────────────────────────────
 *
 * Uma tabela vazia continua a ter o cabeçalho, e muitas destas páginas põem
 * ainda uma linha a dizer "sem registos" DENTRO do corpo. Contar `tr` às cegas
 * daria 1 ou 2 para uma tabela sem nada.
 *
 * Por isso contam-se só as linhas do corpo que não sejam cabeçalho e que não
 * sejam elas próprias a mensagem de vazio.
 */
function linhasDeResultados() {
  const tabelas = [...document.querySelectorAll('table')].filter(visivel);
  if (tabelas.length === 0) return null;

  // A maior: estas páginas têm tabelas de leiaute à volta da que interessa.
  let melhor = null;
  let maisLinhas = -1;
  for (const t of tabelas) {
    const n = t.querySelectorAll('tr').length;
    if (n > maisLinhas) { maisLinhas = n; melhor = t; }
  }
  if (!melhor) return null;

  const VAZIO = /sem registos|sem movimentos|sem resultados|não (existem|foram)|nao (existem|foram)|nenhum|no records|no data|no results/i;

  const corpo = melhor.tBodies.length > 0 ? [...melhor.tBodies] : [melhor];
  let linhas = 0;
  for (const secao of corpo) {
    for (const tr of secao.querySelectorAll('tr')) {
      if (tr.querySelector('th') && !tr.querySelector('td')) continue;   // cabeçalho
      // Linhas-modelo escondidas, que estas páginas guardam para clonar.
      if (!visivel(tr)) continue;
      const texto = (tr.textContent ?? '').trim();
      if (!texto) continue;
      if (VAZIO.test(texto)) continue;
      linhas += 1;
    }
  }
  return linhas;
}

/**
 * A página diz, por palavras, que está a carregar?
 *
 * Só conta o que está À VISTA. `document.body.textContent` traz também o texto
 * de tudo o que está escondido, e estas páginas guardam sempre um "A carregar"
 * algures no HTML, pronto a mostrar — lido às cegas, dava "está a carregar"
 * para sempre, e o contador nunca mais chegava a uma conclusão.
 *
 * Falhar assim nem sequer dava erro: descarregava sempre, como antes, e a
 * poupança que isto traz desaparecia sem nada a explicá-lo.
 */
function pareceACarregar() {
  const ocupado = document.querySelector('[aria-busy="true"]');
  if (ocupado && visivel(ocupado)) return true;
  return /a carregar|carregando|loading|aguarde|please wait/i.test(textoDaPagina());
}

/** Uma impressão digital do que a tabela está a mostrar neste instante. */
function assinaturaDaTabela() {
  const tabelas = [...document.querySelectorAll('table')].filter(visivel);
  if (tabelas.length === 0) return 'sem-tabela';
  let melhor = null;
  let mais = -1;
  for (const t of tabelas) {
    const n = t.querySelectorAll('tr').length;
    if (n > mais) { mais = n; melhor = t; }
  }
  const texto = (melhor?.textContent ?? '').replace(/\s+/g, ' ');
  return `${mais}|${texto.length}|${texto.slice(0, 120)}`;
}

/**
 * Esperar que a tabela pare de mexer.
 *
 * ─── O ERRO QUE ISTO CORRIGE ───────────────────────────────────────────────
 *
 * Pôr as datas no filtro e contar a seguir parece a ordem certa, e não é: o
 * filtro dispara um pedido ao servidor e devolve o controlo IMEDIATAMENTE. No
 * instante em que se contava, o ecrã ainda mostrava os resultados do período
 * anterior — então o contador via linhas, dizia "há movimentos", e o download
 * acontecia na mesma numa semana que estava vazia.
 *
 * Era um erro silencioso e por isso difícil de ver: o resultado final estava
 * certo (o PDF vinha vazio), só se perdia o tempo que isto vinha poupar.
 *
 * Espera-se por DUAS leituras iguais seguidas, e não só por uma pausa: uma
 * tabela a meio de ser pintada fica parada entre pedaços, e um único instante
 * quieto não quer dizer que acabou.
 */
async function esperarQueAssente(maximoMs = 10000) {
  const fim = Date.now() + maximoMs;
  let anterior = null;

  while (Date.now() < fim) {
    if (pareceACarregar()) {
      anterior = null;                     // recomeça a contagem de estabilidade
    } else {
      const agora = assinaturaDaTabela();
      if (anterior !== null && agora === anterior) return true;
      anterior = agora;
    }
    await dormir(700);
  }
  return false;
}

/**
 * Quantos movimentos tem a semana que está no filtro — ou `null` se não sei.
 *
 * Três caminhos, do mais fiável para o menos:
 *
 *   1. Um número escrito na página ("66 movimentos filtrados").
 *   2. Uma frase explícita de vazio ("não existem registos").
 *   3. A tabela de resultados sem uma única linha de dados.
 *
 * ─── PORQUE É QUE O TERCEIRO CAMINHO LÊ DUAS VEZES ──────────────────────────
 *
 * Porque uma tabela que ainda não acabou de carregar também tem zero linhas, e
 * confundir as duas coisas é o erro caro: salta-se o download de uma semana
 * que TINHA despesas, e elas desaparecem do fecho sem nada a dizê-lo.
 *
 * Então espera-se, lê-se outra vez, e só se aceita o zero se as duas leituras
 * concordarem e a página não estiver a dizer que está a carregar.
 *
 * ─── E PORQUE É QUE DEVOLVE null EM VEZ DE ZERO ─────────────────────────────
 *
 * Porque "não consegui contar" e "não há nada" não são a mesma coisa. Só se
 * salta o download quando se LÊ um zero. Na dúvida, descarrega-se — perde-se
 * meio minuto, que é muito menos do que perder uma despesa.
 */
window.__dragonfleetContarMovimentos = async function () {
  // Primeiro esperar. Contar uma tabela a meio de carregar é contar a semana
  // anterior — ver a nota em `esperarQueAssente`.
  const assentou = await esperarQueAssente();
  if (!assentou) return null;               // nunca parou quieta: não arrisco

  const texto = textoDaPagina();

  // ── 1. Uma frase de vazio ────────────────────────────────────────────────
  //
  // ANTES dos números, de propósito. "Sem Resultados." é uma afirmação da
  // página; um número apanhado por expressão regular pode vir de uma ajuda, de
  // um rodapé ou de uma caixa aberta ao lado. Quando a página diz por palavras
  // que não tem nada, é isso que vale.
  const FRASES_DE_VAZIO = new RegExp(
    [
      'sem (registos|movimentos|resultados|dados|transa[cç][õo]es)',
      'n[ãa]o (existem|h[áa]|foram encontrados?|se encontraram)',
      'nenhum[a]? (registo|movimento|resultado|dado|transa[cç][ãa]o|linha)',
      'no (records|data|results|movements|transactions)( found)?',
      'lista vazia', 'tabela vazia', 'nada a mostrar',
    ].join('|'),
    'i',
  );
  if (FRASES_DE_VAZIO.test(texto)) return 0;

  // ── 2. Um número escrito ─────────────────────────────────────────────────
  const padroes = [
    /(\d+)\s+movimentos?\s+filtrados?/i,
    /(\d+)\s+movimentos?\b/i,
    /(\d+)\s+registos?\b/i,
    /(\d+)\s+resultados?\b/i,
    /(\d+)\s+transa[cç][õo]es?\b/i,
  ];
  for (const padrao of padroes) {
    const m = padrao.exec(texto);
    if (m) return Number(m[1]);
  }

  // ── 3. A tabela ──────────────────────────────────────────────────────────
  //
  // Já assentou, por isso uma leitura chega.
  const linhas = linhasDeResultados();
  if (linhas === null) return null;         // nem tabela há: não arrisco
  return linhas;
};

/**
 * Só pôr as datas no filtro, sem exportar nada.
 *
 * Existe para a contagem poder acontecer NO MEIO: primeiro filtra-se, depois
 * conta-se o que a semana pedida tem, e só se descarrega o relatório se houver
 * alguma coisa lá dentro. Contar antes de filtrar contaria o que estava no
 * ecrã, que é outra semana qualquer.
 *
 * Devolve `{ ok, erro }` em vez de atirar porque atravessa a fronteira entre a
 * página e o service worker, e uma exceção nessa passagem chega do outro lado
 * como "Error in invocation" — sem a frase que diz o que falhou.
 */
window.__dragonfleetPorDatas = async function (semana) {
  try {
    if (semana?.inicio && semana?.fim) await porDatasNoFiltro(semana);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
};

window.__dragonfleetClicarExportar = async function (semana, jaFiltrado = false) {
  try {
    // Filtrar primeiro. Sem isto o relatório sai com o período que estiver no
    // ecrã, que raramente é o que se quer.
    //
    // `jaFiltrado` vem a `true` quando o worker já chamou `__dragonfleetPorDatas`
    // para poder contar os movimentos antes de decidir se vale a pena
    // descarregar. Filtrar outra vez não daria resultado errado, mas mexer no
    // seletor de datas duas vezes é meio minuto de espera a troco de nada — e
    // em algumas destas páginas um segundo clique no seletor fecha-o.
    if (!jaFiltrado && semana?.inicio && semana?.fim) await porDatasNoFiltro(semana);
    await carregarEmExportarPdf();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
};

/**
 * Tenta pôr a semana no filtro da Uber ou da Bolt.
 *
 * ─── PORQUE É QUE ISTO PODE FALHAR SEM SER GRAVE ───────────────────────────
 *
 * A Prio e a Via Verde têm dois campos de data normais, que se preenchem. A
 * Bolt e a Uber usam seletores de intervalo — um só campo com "11 Aug - 17 Aug"
 * lá dentro, desenhado à mão — e esses não se preenchem escrevendo.
 *
 * Por isso isto DEVOLVE o que aconteceu em vez de atirar: quem chama lê na
 * mesma a tabela e depois CONFERE o período que a página mostra contra a
 * semana pedida. Se não bater, aí sim recusa.
 *
 * É a ordem certa das garantias: tentar poupar trabalho é opcional, não
 * importar a semana errada não é.
 */
/**
 * O que a extensão vê nesta página. Para diagnóstico, não para funcionar.
 *
 * ─── PORQUE É QUE ISTO EXISTE ──────────────────────────────────────────────
 *
 * Porque a alternativa era eu continuar a deduzir a estrutura das páginas a
 * partir de fotografias do ecrã, uma suposição de cada vez, com uma volta de
 * conversa entre cada tentativa. Isso custa uma tarde e acerta por sorte.
 *
 * Isto devolve o que o código REALMENTE encontra: a etiqueta do intervalo, os
 * campos que considera serem datas, os botões ao alcance, a tabela que
 * identificou e as primeiras linhas que leu. Com isso, uma correção passa a ser
 * uma correção e não mais um palpite.
 *
 * Não lê valores de dinheiro nem nomes completos — corta tudo a 60 caracteres
 * e traz no máximo três linhas, o suficiente para perceber a forma da tabela.
 */
window.__dragonfleetDiagnostico = function () {
  const curto = (t, n = 60) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

  const campos = [...document.querySelectorAll('input, textarea')]
    .filter(visivel)
    .slice(0, 25)
    .map((c) => ({
      tag: c.tagName.toLowerCase(),
      type: c.type ?? '',
      valor: curto(c.value, 40),
      placeholder: curto(c.placeholder, 30),
      rotulo: curto(c.getAttribute('aria-label') ?? c.name ?? '', 30),
    }));

  const botoes = [...document.querySelectorAll('button, [role="button"], a')]
    .filter(visivel)
    .map((b) => curto(b.textContent, 30))
    .filter((t) => t && t.length <= 30)
    .slice(0, 40);

  const etiqueta = etiquetaDeIntervalo();
  const detetados = camposDeData();

  return {
    endereco: location.href.split('?')[0],
    etiquetaIntervalo: etiqueta ? curto(etiqueta.textContent) : null,
    etiquetaTag: etiqueta ? etiqueta.tagName.toLowerCase() : null,
    camposVisiveis: campos,
    camposTidosComoData: detetados.map((c) => ({
      valor: curto(c.value, 40), placeholder: curto(c.placeholder, 30),
    })),
    campoDeIntervalo: campoDeIntervalo() ? curto(campoDeIntervalo().value, 40) : null,
    mesVisivelNoCalendario: mesVisivel(),
    botoes,
    tabelas: document.querySelectorAll('table').length,
  };
};

/**
 * O que o contador de movimentos vê, para o diagnóstico do popup.
 *
 * Exposto em vez de reimplementado lá: o diagnóstico só vale se reportar o que
 * o código REAL faz. Uma segunda cópia da lógica diria o que eu acho que ela
 * faz, que é exatamente a informação que não serve para nada.
 */
window.__dragonfleetDiagnosticoContagem = async function () {
  const curto = (t, n) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    resultado: await window.__dragonfleetContarMovimentos(),
    linhasDaTabela: linhasDeResultados(),
    pareceACarregar: pareceACarregar(),
    // O fim do texto da página: é onde costumam viver os rodapés com
    // "N registos" e as mensagens de lista vazia.
    fimDoTexto: curto(textoDaPagina().slice(-400), 400),
  };
};

window.__dragonfleetDatasGanhos = async function (semana) {
  // O `registo` diz por onde passou. Sem ele, um "não deu" fica sem resposta
  // possível a não ser experimentar outra vez às cegas.
  const registo = [];
  try {
    await porDatasNoFiltro(semana, registo);
    return { ok: true, registo };
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e), registo };
  }
};

window.__dragonfleetRecolher = async function (portal, semana) {
  try {
    if (portal === 'VIA_VERDE') return { ok: true, ...(await recolherViaVerde(semana)) };
    if (portal === 'PRIO') return { ok: true, ...(await recolherPrio(semana)) };
    throw new Error(`Portal desconhecido: ${portal}`);
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
};

// ═══ A CONFERÊNCIA CRUZADA ═══════════════════════════════════════════════════
//
// Da Via Verde vêm duas fontes independentes do mesmo dinheiro: o PDF, que o
// servidor gera e que declara o seu próprio total, e a listagem em JSON, onde
// cada movimento traz a matrícula.
//
// O DragonFleet soma as duas e compara. É uma garantia diferente da que já lá
// está: o leitor do PDF confere a soma das matrículas contra o total impresso
// no próprio PDF — o que apanha um erro de leitura, mas não apanharia um PDF
// gerado com o período errado, porque aí o documento estaria coerente consigo
// mesmo e errado à mesma.
//
// Duas fontes pedidas em separado, com o mesmo intervalo, a dar o mesmo número
// por matrícula é uma coisa que não acontece por acaso.
