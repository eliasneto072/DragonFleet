// extension/src/adapters.js
//
// Um adaptador por portal: sabe o que a página mostra e devolve linhas
// normalizadas.
//
// ─── O QUE CADA PORTAL DÁ, CONFIRMADO NAS CAPTURAS ───────────────────────────
//
// UBER — "Rendimentos do motorista"
//   Nome do motorista | Rendimentos totais | Reembolsos e despesas |
//   Ajustes | Pagamento | Rendimentos líquidos
//
//   Verificado: 312,89 + 9,25 + 0,00 = 322,14. O "líquido" é a SOMA das outras,
//   ou seja, o valor a pagar COM os reembolsos incluídos. Um reembolso não é
//   ganho — é dinheiro que o motorista adiantou e lhe está a ser devolvido — e
//   por isso os dois são enviados em separado: o DragonFleet decide o que fazer
//   com cada um, em vez de receber uma soma que já não se pode desfazer.
//
// BOLT — "Earnings per driver"
//   Driver | Gross earnings (total) | ... | Net earnings | ...
//
//   Verificado: 490,7 de bruto e 371,97 de líquido para a Mónica — a Bolt
//   retém cerca de 24%. O que interessa ao fecho é o LÍQUIDO, que é o que a
//   frota recebe.
//
// ─── POR QUE ESTA CAMADA EXISTE À PARTE DO EXTRATOR ──────────────────────────
//
// O extrator não sabe nada de Uber nem de Bolt: encontra tabelas por
// cabeçalho. Os adaptadores sabem quais são os cabeçalhos e o que significam.
// Quando um portal mudar um rótulo, muda-se aqui uma linha — e não se toca na
// mecânica de leitura.


/** Datas no formato que o servidor exige: AAAA-MM-DD. */
function paraDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Extrai o período do seletor de datas da página.
 *
 * Os dois portais mostram-no como texto: a Uber "24/08/2026 04:03 AM -
 * 30/08/2026 12:23 AM", a Bolt "11 Aug - 17 Aug". Ler daí evita pedir à pessoa
 * que reescreva o que já está no ecrã — e evita o erro de ela enganar-se.
 *
 * Devolve null quando não encontra: aí a extensão pergunta, em vez de adivinhar
 * um período e importar uma semana para dentro de outra.
 */
function extrairPeriodo() {
  const corpo = extrator.texto(document.body);

  // ── DD/MM/AAAA, as duas primeiras que aparecerem ─────────────────────────
  //
  // Antes isto era uma expressão só, a exigir as duas datas com um travessão
  // pelo meio e nada com algarismos entre elas. A Uber escreve
  // "21/09/2026 04:00 AM - 28/09/2026 04:00 AM" — e as horas no meio têm
  // algarismos. A expressão não casava, o período ficava por ler, e a extensão
  // avisava que não o conseguia conferir.
  //
  // Procurar as datas uma a uma e ficar com as duas primeiras é mais simples e
  // aguenta o que estiver entre elas: horas, fusos, o que a página quiser pôr.
  const datas = [...corpo.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (datas.length >= 2) {
    return {
      periodStart: `${datas[0][3]}-${datas[0][2]}-${datas[0][1]}`,
      periodEnd: `${datas[1][3]}-${datas[1][2]}-${datas[1][1]}`,
    };
  }

  // "11 Aug - 17 Aug" — sem ano. Assume o ano corrente, e recua um se o
  // intervalo cair no futuro (uma semana de dezembro vista em janeiro).
  const MESES = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const en = corpo.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3})/);
  if (en) {
    const ano = new Date().getFullYear();
    const ini = new Date(ano, MESES[en[2].toLowerCase()], Number(en[1]));
    const fim = new Date(ano, MESES[en[4].toLowerCase()], Number(en[3]));
    if (fim > new Date()) { ini.setFullYear(ano - 1); fim.setFullYear(ano - 1); }
    return { periodStart: paraDia(ini), periodEnd: paraDia(fim) };
  }

  return null;
}

// ─── Uber ─────────────────────────────────────────────────────────────────────

function extrairUber() {
  // Duas tentativas, da mais exigente para a mais tolerante.
  //
  // A exigente pede as duas colunas e é a que distingue esta tabela de outra
  // qualquer. A tolerante pede só o nome — porque a Uber mostra "Rendimentos
  // totais", "Reembolsos e despesas", "Ajustes", "Pagamento" e "Rendimentos
  // líquidos", e nem todas cabem no ecrã ao mesmo tempo: a coluna dos líquidos
  // pode simplesmente não estar desenhada.
  //
  // Exigir uma coluna que pode não estar lá fazia a tabela inteira passar por
  // inexistente, e o erro dizia "não encontrei a tabela" numa página onde ela
  // está à vista.
  const encontrada = extrator.encontrarTabela(['nome do motorista', 'rendimentos liquidos'])
    ?? extrator.encontrarTabela(['nome do motorista']);

  if (!encontrada) {
    throw new Error(
      'Não encontrei a tabela de rendimentos nesta página.\n\n' +
      'Confirme que está em Rendimentos, no portal de fornecedor da Uber, e que ' +
      'a lista de motoristas está visível.',
    );
  }

  if (encontrada.tipo === 'grelha' || encontrada.tipo === 'table') {
    const ler = encontrada.tipo === 'grelha'
      ? extrator.lerLinhasDeGrelha : extrator.lerLinhasDeTable;
    const linhas = ler(encontrada.el, encontrada.cabecalhos, {
      nome: 'nome do motorista',
      totais: 'rendimentos totais',
      reembolsos: 'reembolsos',
      ajustes: 'ajustes',
      liquidos: 'rendimentos liquidos',
    });

    // Se a tabela não deu linhas nenhumas, não se desiste: lê-se o mesmo
    // elemento como se fosse feito de `div`. Uma tabela pode estar desenhada
    // de formas que o mapeamento por cabeçalho não apanha, e devolver zero
    // sem tentar o outro caminho era dizer "está vazia" com ela à frente.
    if (linhas.length === 0) {
      return extrator.lerLinhasDeDivs(encontrada.el).map((l) => ({
        driverName: l.nome,
        // O último valor da linha é o líquido, que é o que conta. Era o
        // primeiro — os totais — e ficava inconsistente com o caminho de cima.
        amount: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
        reimbursements: 0,
        adjustments: 0,
        netPaid: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
        coarse: true,
      }));
    }

    return linhas.map((l) => ({
      driverName: l.nome,
      // ─── O VALOR É O LÍQUIDO ────────────────────────────────────────────
      //
      // Decisão do cliente, e é a que bate com o dinheiro que entra: a soma
      // dos líquidos (740,31 + 350,58 + 159,83) dá 1250,72 €, exatamente o
      // saldo final que o portal mostra. Os "Rendimentos totais" somam
      // 1224,73 € e não correspondem a transferência nenhuma.
      //
      // Fica dito o que isto implica, porque é real: o líquido já inclui os
      // reembolsos de despesas, e esses não são faturação — são dinheiro que o
      // motorista adiantou e lhe está a ser devolvido. Como a base do imposto
      // de 6% é Uber + Bolt, a taxa passa a incidir também sobre eles. São
      // poucos euros por semana, e a alternativa — usar os totais — faria o
      // fecho não bater com o extrato. Entre as duas, bater com o extrato
      // ganha; se o contabilista disser o contrário, muda-se esta linha.
      amount: parseMoney(l.liquidos) ?? parseMoney(l.totais) ?? 0,
      // Vão à parte, para o DragonFleet decidir o que fazer com eles.
      reimbursements: parseMoney(l.reembolsos) ?? 0,
      adjustments: parseMoney(l.ajustes) ?? 0,
      netPaid: parseMoney(l.liquidos) ?? 0,
    }));
  }

  // A página desenha a lista com `div`. Aí só há um valor por linha, que é o
  // líquido — foi o que se viu no PDF impresso, onde a tabela colapsa.
  return extrator.lerLinhasDeDivs(encontrada.el).map((l) => ({
    driverName: l.nome,
    amount: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
    reimbursements: 0,
    adjustments: 0,
    netPaid: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
    /** Sinaliza que as parcelas não estavam separadas nesta leitura. */
    coarse: true,
  }));
}

// ─── Bolt ─────────────────────────────────────────────────────────────────────

function extrairBolt() {
  // Mesma ideia da Uber. Aqui a segunda tentativa pede "driver" E "earnings"
  // e não só "driver": sozinha, essa palavra aparece em meia dúzia de sítios
  // do Bolt Fleet e apanhava a tabela errada.
  const encontrada = extrator.encontrarTabela(['driver', 'net earnings'])
    ?? extrator.encontrarTabela(['driver', 'earnings']);

  if (!encontrada) {
    throw new Error(
      'Não encontrei a tabela de ganhos nesta página.\n\n' +
      'Confirme que está em Finances › Earnings per driver, no Bolt Fleet.',
    );
  }

  if (encontrada.tipo === 'grelha' || encontrada.tipo === 'table') {
    const ler = encontrada.tipo === 'grelha'
      ? extrator.lerLinhasDeGrelha : extrator.lerLinhasDeTable;
    const linhas = ler(encontrada.el, encontrada.cabecalhos, {
      nome: 'driver',
      bruto: 'gross earnings (total)',
      liquido: 'net earnings',
      gorjetas: 'rider tips',
    });

    if (linhas.length === 0) {
      return extrator.lerLinhasDeDivs(encontrada.el).map((l) => ({
        driverName: l.nome,
        amount: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
        coarse: true,
      }));
    }

    return linhas.map((l) => ({
      driverName: l.nome,
      // O líquido: é o que a frota recebe, depois da comissão da Bolt.
      amount: parseMoney(l.liquido) ?? 0,
      gross: parseMoney(l.bruto) ?? 0,
      tips: parseMoney(l.gorjetas) ?? 0,
    }));
  }

  return extrator.lerLinhasDeDivs(encontrada.el).map((l) => ({
    driverName: l.nome,
    amount: parseMoney(l.valores[l.valores.length - 1]) ?? 0,
    coarse: true,
  }));
}

/** Qual o portal desta página, pelo endereço. */
function detetarPortal() {
  const h = location.hostname;
  // Os dois endereços da Uber. O fleethub é o que o cliente usa; o supplier
  // é o antigo, e continua aceite porque desligá-lo não ganha nada e parte a
  // recolha de quem ainda lá esteja.
  if (h.includes('uber.com')) return 'UBER';
  if (h.includes('bolt.eu') || h.includes('fleets.bolt.eu')) return 'BOLT';
  return null;
}

function extrair() {
  const portal = detetarPortal();
  if (!portal) throw new Error('Esta página não é o portal da Uber nem o da Bolt.');

  const rows = portal === 'UBER' ? extrairUber() : extrairBolt();
  const periodo = extrairPeriodo();

  return { platform: portal, rows, periodo };
}


// ─── Ponte para o popup ───────────────────────────────────────────────────────
//
// O `chrome.scripting.executeScript` com `files` carrega isto como script
// clássico, não como módulo: os `import`/`export` não existem neste contexto.
// Por isso os dois ficheiros são carregados em sequência e comunicam pelo
// `window`, e a função é exposta com um nome improvável de colidir.
//
// O erro é DEVOLVIDO em vez de lançado: uma exceção dentro do executeScript
// chega ao popup como "resultado indefinido", sem mensagem nenhuma.
window.__dragonfleetExtrair = function () {
  try {
    return extrair();
  } catch (e) {
    return { erro: e.message, rows: [] };
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico
// ─────────────────────────────────────────────────────────────────────────────
//
// Vive AQUI, e não no popup, por uma razão prática que custou várias rondas:
// este ficheiro é injetado na página a cada utilização e por isso está sempre
// atualizado. Os ficheiros do popup ficam em cache do Chrome até a extensão ser
// REINSTALADA — recarregar nem sempre chega — e um diagnóstico que não se
// consegue atualizar não serve para diagnosticar nada.

const dormirBreve = (ms) => new Promise((r) => setTimeout(r, ms));

function estaVisivel(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * Tenta mesmo abrir o menu de períodos e conta o que aconteceu em cada passo.
 *
 * MEXE na página de propósito. Descrever o botão já não chegava: o que falta
 * saber é se ele reage a eventos sintéticos, e a quais.
 */
window.__dragonfleetTesteMenu = async function () {
  const curto = (t, n = 24) => (t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

  const gatilhos = [...document.querySelectorAll(
    '[aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"]',
  )].filter(estaVisivel);

  const fora = {
    gatilhos: gatilhos.map((g) => ({
      texto: curto(g.textContent),
      tag: g.tagName.toLowerCase(),
      expandido: g.getAttribute('aria-expanded'),
    })),
    passos: [],
  };

  const g = gatilhos.find((x) => /today|last|custom|hoje|semana/i.test(x.textContent || ''))
         ?? gatilhos[0];
  if (!g) { fora.erro = 'nenhum botão de menu encontrado'; return fora; }

  const estado = () => g.getAttribute('aria-expanded');

  g.click();
  await dormirBreve(500);
  fora.passos.push({ tentativa: 'click', expandido: estado() });

  if (estado() !== 'true') {
    const o = { bubbles: true, cancelable: true, view: window };
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      try { g.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o)); } catch { /* */ }
    }
    await dormirBreve(500);
    fora.passos.push({ tentativa: 'ponteiro', expandido: estado() });
  }

  if (estado() !== 'true') {
    g.focus?.();
    for (const key of ['Enter', 'ArrowDown', ' ']) {
      g.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      g.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      await dormirBreve(400);
      fora.passos.push({ tentativa: `tecla ${key === ' ' ? 'espaço' : key}`, expandido: estado() });
      if (estado() === 'true') break;
    }
  }

  fora.opcoes = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, button')]
    .filter(estaVisivel)
    .map((el) => curto(el.textContent, 20))
    .filter((t) => /today|last|custom|week|month|day/i.test(t))
    .slice(0, 12);

  fora.campoDepois = [...document.querySelectorAll('input')]
    .filter(estaVisivel)
    .map((c) => c.value)
    .find((v) => /\d{1,2}\s+[A-Za-z]{3}/.test(v ?? '')) ?? null;

  return fora;
};


/**
 * Põe a semana no filtro da Bolt, com o MESMO código que o diagnóstico usa.
 *
 * ─── PORQUE É QUE ISTO VIVE AQUI E NÃO NO recolha.js ───────────────────────
 *
 * Porque aqui funciona. O diagnóstico abria o menu sem falhar uma vez, e a
 * versão paralela no `recolha.js` não — duas cópias da mesma ideia, uma boa e
 * outra não, e a manter-se assim eu ia corrigir sempre a errada.
 *
 * A Bolt também não precisa do mundo principal da página: não há cookies a
 * herdar nem pedidos a apanhar, só cliques. E o DOM é o mesmo nos dois mundos.
 *
 * Devolve `{ok, rasto}`. O rasto diz por onde passou — é o que transforma um
 * "não deu" numa correção.
 */
window.__dragonfleetPorSemanaBolt = async function (semana) {
  const rasto = [];
  const curto = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
  const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const diaEMes = (dia) => {
    const [, m, d] = dia.split('-').map(Number);
    return `${d} ${MESES[m - 1]}`;
  };

  const campoIntervalo = () => [...document.querySelectorAll('input')]
    .filter(estaVisivel)
    .find((c) => /\d{1,2}\s+[A-Za-z]{3}/.test(c.value ?? '')
              || /d\s*MMM/i.test(c.placeholder ?? '')) ?? null;

  const esperado = diaEMes(semana.inicio).toLowerCase();
  const jaEstaCerto = () =>
    (campoIntervalo()?.value ?? '').toLowerCase().includes(esperado);

  if (jaEstaCerto()) { rasto.push('o filtro ja estava certo'); return { ok: true, rasto }; }

  // ── Abrir o menu: o código do diagnóstico, tal e qual ────────────────────
  const gatilhos = [...document.querySelectorAll(
    '[aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"]',
  )].filter(estaVisivel);

  const g = gatilhos.find((x) => /today|last|custom|hoje|semana/i.test(x.textContent || ''))
         ?? gatilhos[0];
  if (!g) { rasto.push('nenhum botao de menu'); return { ok: false, rasto }; }
  rasto.push(`botao: "${curto(g.textContent).slice(0, 24)}"`);

  const estado = () => g.getAttribute('aria-expanded');

  g.click();
  await dormirBreve(500);
  rasto.push(`click → expandido=${estado()}`);

  if (estado() !== 'true') {
    const o = { bubbles: true, cancelable: true, view: window };
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      try { g.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o)); } catch { /* */ }
    }
    await dormirBreve(500);
    rasto.push(`ponteiro → expandido=${estado()}`);
  }

  if (estado() !== 'true') { rasto.push('o menu nao abriu'); return { ok: false, rasto }; }

  // ── Escolher "Last week" ─────────────────────────────────────────────────
  const opcoes = [...document.querySelectorAll('[role="menuitem"], [role="option"], li, button, div, span')]
    .filter(estaVisivel)
    .filter((el) => curto(el.textContent).toLowerCase() === 'last week');
  rasto.push(`opcoes "Last week": ${opcoes.length}`);
  if (opcoes.length === 0) { rasto.push('opcao nao encontrada'); return { ok: false, rasto }; }

  // O mais FUNDO dos que têm esse texto: os de cima são contentores à volta,
  // e carregar num contentor costuma não disparar nada.
  const item = opcoes.reduce((a, b) => (a.contains(b) ? b : a));

  item.click();
  await dormirBreve(1500);
  if (jaEstaCerto()) { rasto.push('ficou certo com o click'); return { ok: true, rasto }; }

  const o = { bubbles: true, cancelable: true, view: window };
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    try { item.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o)); } catch { /* */ }
  }
  await dormirBreve(1800);
  if (jaEstaCerto()) { rasto.push('ficou certo com os eventos de rato'); return { ok: true, rasto }; }

  rasto.push(`campo ficou "${campoIntervalo()?.value ?? '(sem campo)'}" e esperava "${diaEMes(semana.inicio)}"`);
  return { ok: false, rasto };
};
